from typing import Optional

from app.config import settings
from app.db import engine
from app.schemas import SearchRequest, SearchResponse, SearchResult
from app.services.chroma_search import multi_query_search
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy import text

router = APIRouter()


def require_api_key(x_api_key: Optional[str] = Header(default=None)):
    if settings.API_KEY and x_api_key != settings.API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/search", response_model=SearchResponse, dependencies=[Depends(require_api_key)])
def search(req: SearchRequest):
    q = (req.query or "").strip()
    if not q:
        return {"results": []}

    # Use multi-query search from ChromaDB
    chroma_results = multi_query_search(
        user_query=q,
        n_results_per_query=10,
        global_limit=req.topK
    )

    # Convert to API response format
    results = []
    for r in chroma_results.results:
        results.append(
            SearchResult(
                thoughtId=r.metadata.get("id", ""),
                title=r.metadata.get("title", ""),
                createdAt=r.metadata.get("created_at", ""),
                snippet=r.document[:200] + "..." if len(r.document) > 200 else r.document,
                score=float(r.distance)
            )
        )

    return {"results": results}
    
    # Previous code without ChromaDB:
    # q = (req.query or "").strip()
    # if not q:
    #     return {"results": []}
    # sql = text(
    #     """
    #     SELECT t.id, t.title, t.created_at,
    #            snippet(f, 1, '<b>', '</b>', '…', 10) AS snip,
    #            bm25(f) AS score
    #     FROM thoughts_fts f
    #     JOIN thoughts t ON t.id = f.thought_id
    #     WHERE f MATCH :q
    #     ORDER BY score
    #     LIMIT :k
    #     """
    # )
    # with engine.begin() as conn:
    #     rows = conn.execute(sql, {"q": q, "k": req.topK}).fetchall()
    # results = []
    # for r in rows:
    #     results.append(
    #         SearchResult(
    #             thoughtId=r[0], title=r[1], createdAt=r[2], snippet=r[3] or "", score=float(r[4] or 0.0)
    #         )
    #     )
    # return {"results": results}
