import os
from dataclasses import dataclass, field
from typing import Any, Dict, List

import chromadb
from app.config import settings

CHROMA_DB_PATH = "./chroma_db"
CHROMA_COLLECTION_NAME = "memory"

@dataclass
class SearchResult:
    """Single search result from ChromaDB"""
    document: str
    metadata: Dict[str, Any]
    distance: float
    query: str
    query_index: int
    found_by_queries: List[str] = field(default_factory=list)
    total_matches: int = 1

    def __post_init__(self):
        if not self.found_by_queries:
            self.found_by_queries = [self.query]

@dataclass
class MultiQueryResults:
    """Results from multi-query search."""
    results: List[SearchResult]
    query_variations: List[str]
    user_query: str
    total_results_before_dedup: int

def _generate_query_variations(user_query: str) -> List[str]:
    """Generate 5 focused query variations using Groq API."""
    from groq import Groq

    client = Groq(api_key=settings.GROQ_API_KEY)

    prompt: str = f"""Generate 5 focused search query variations for: "{user_query}"

Create variations that stay relevant to the core topic:
1. Original query (keep the same meaning)
2. Use synonyms for key terms only
3. Slightly shorter version
4. Add one relevant detail
5. Rephrase using different words but same intent

Keep all variations closely related to the original query's meaning.

Output only the queries, numbered 1-5:

1."""

    chat_completion = client.chat.completions.create(
        messages=[{"role": "user", "content": prompt}],
        model="llama-3.3-70b-versatile",
        temperature=0.4,
        max_tokens=250
    )

    content: str = chat_completion.choices[0].message.content

    # Parse numbered list
    variations: List[str] = []
    for line in content.strip().split('\n'):
        if line.strip() and line[0].isdigit() and '.' in line:
            query: str = line.split('.', 1)[1].strip()
            variations.append(query)

    return variations[:5]

def _get_or_create_collection() -> chromadb.api.models.Collection.Collection:
    """Return a persistent ChromaDB collection (uses ChromaDB's default embeddings)."""
    os.makedirs(CHROMA_DB_PATH, exist_ok=True)
    client = chromadb.PersistentClient(path=CHROMA_DB_PATH)
    try:
        return client.get_collection(CHROMA_COLLECTION_NAME)
    except Exception:
        return client.create_collection(CHROMA_COLLECTION_NAME)

def multi_query_search(user_query: str, n_results_per_query: int = 10, global_limit: int = 20) -> MultiQueryResults:
    """
    Search using multiple query variations and return globally ranked results.

    Args:
        user_query: Original user query
        n_results_per_query: Number of results per query variation
        global_limit: Maximum total results to return

    Returns:
        Dictionary with search results and metadata
    """
    # Step 1: Generate query variations
    query_variations: List[str] = _generate_query_variations(user_query)

    # Step 2: Execute all queries
    collection: chromadb.api.models.Collection.Collection = _get_or_create_collection()
    all_results: List[SearchResult] = []

    for i, query in enumerate(query_variations, 1):
        results: Dict[str, Any] = collection.query(
            query_texts=[query],
            n_results=n_results_per_query,
            include=["documents", "metadatas", "distances"]
        )

        # Add query metadata to results
        documents: List[str] = results["documents"][0]
        metadatas: List[Dict] = results["metadatas"][0]
        distances: List[float] = results["distances"][0]

        for j, doc in enumerate(documents):
            result = SearchResult(
                document=doc,
                metadata=metadatas[j],
                distance=distances[j],
                query=query,
                query_index=i
            )
            all_results.append(result)

    # Step 3: Deduplicate and rank globally
    ranked_results: List[SearchResult] = _deduplicate_and_rank(all_results, global_limit)

    return MultiQueryResults(
        results=ranked_results,
        query_variations=query_variations,
        user_query=user_query,
        total_results_before_dedup=len(all_results)
    )

def _deduplicate_and_rank(all_results: List[SearchResult], limit: int) -> List[SearchResult]:
    """
    Deduplicate results by document and rank globally by best similarity score.

    Args:
        all_results: List of all search results from multiple queries
        limit: Maximum number of results to return

    Returns:
        List of deduplicated and ranked results
    """
    # Group results by document text
    doc_groups: Dict[str, List[SearchResult]] = {}

    for result in all_results:
        if result.document not in doc_groups:
            doc_groups[result.document] = []
        doc_groups[result.document].append(result)

    # For each document, keep the best result (lowest distance = highest similarity)
    best_results: List[SearchResult] = []

    for doc_text, results in doc_groups.items():
        # Get best result (lowest distance)
        best_result: SearchResult = min(results, key=lambda x: x.distance)

        # Update with deduplication info
        best_result.found_by_queries = [r.query for r in results]
        best_result.total_matches = len(results)

        best_results.append(best_result)

    # Sort all results by distance (lowest first = most similar)
    best_results.sort(key=lambda x: x.distance)

    # Return top results
    return best_results[:limit]

# ======================================================
# Sync Functions for Jenny AI
# ======================================================
def add_thought_to_chroma(thought_id: str, content: str, metadata: dict) -> None:
    """Add a thought to ChromaDB for searching."""
    collection = _get_or_create_collection()
    collection.add(
        ids=[thought_id],
        documents=[content],
        metadatas=[metadata]
    )


def delete_thought_from_chroma(thought_id: str) -> None:
    """Remove a thought from ChromaDB."""
    collection = _get_or_create_collection()
    try:
        collection.delete(ids=[thought_id])
    except Exception:
        pass