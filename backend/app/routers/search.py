from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from sqlalchemy import text
from sqlalchemy.exc import OperationalError
import httpx
import json

from app.config import settings
from app.db import engine
from app.schemas import (
    SearchRequest,
    SearchResponse,
    SearchResult,
    ThoughtOut,
    AssistCommentRequest,
    AssistCommentResponse,
)

router = APIRouter()


def require_api_key(x_api_key: Optional[str] = Header(default=None)):
    if settings.API_KEY and x_api_key != settings.API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


def get_user_id(x_user_id: Optional[str] = Header(default=None)) -> str:
    return x_user_id or "demo"


@router.post("/search", response_model=SearchResponse, dependencies=[Depends(require_api_key)])
def search(req: SearchRequest, user_id: str = Depends(get_user_id)):
    assert 1 == 2, "Assert statement for debugging search()"
    q = (req.query or "").strip()
    if not q:
        return {"results": []}
    sql = text(
        """
        SELECT t.id, t.title, t.created_at,
               snippet(thoughts_fts, 1, '<b>', '</b>', '…', 10) AS snip,
               bm25(thoughts_fts) AS score
        FROM thoughts_fts
        JOIN thoughts t ON t.id = thoughts_fts.thought_id
        WHERE t.user_id = :uid AND thoughts_fts MATCH :q
        ORDER BY score
        LIMIT :k
        """
    )
    with engine.begin() as conn:
        rows = conn.execute(sql, {"q": q, "k": req.topK, "uid": user_id}).fetchall()
    results = []
    for r in rows:
        results.append(
            SearchResult(
                thoughtId=r[0], title=r[1], createdAt=r[2], snippet=r[3] or "", score=float(r[4] or 0.0)
            )
        )
    return {"results": results}


@router.post("/assist-search-full", response_model=list[ThoughtOut], dependencies=[Depends(require_api_key)])
def assist_search_full(req: SearchRequest, user_id: str = Depends(get_user_id)):
    q = (req.query or "").strip()
    if not q:
        return []

    # Fetch ALL thoughts for this user
    sql = text(
        """
        SELECT t.id, t.user_id, t.source, t.title, t.summary, t.content,
               t.tags_json, t.entities_json, t.interpretation, t.created_at
        FROM thoughts t
        WHERE t.user_id = :uid
        ORDER BY t.created_at DESC
        """
    )
    with engine.begin() as conn:
        rows = conn.execute(sql, {"uid": user_id}).fetchall()

    if not rows:
        return []

    # Build thoughts list for Groq
    thoughts_for_groq = []
    for idx, r in enumerate(rows):
        thoughts_for_groq.append({
            "index": idx,
            "content": r[5] or "",
        })

    # Ask Groq which thoughts are relevant
    prompt = (
        f"User query: {q}\n"
        f"Max results: {req.topK}\n\n"
        f"Thoughts:\n{json.dumps(thoughts_for_groq)}\n\n"
        "You must return ONLY valid JSON matching this exact schema:\n\n"
        "{\n"
        '  "relevant_indices": [0, 5, 12]\n'
        "}\n\n"
        "Where:\n"
        "- relevant_indices: array of integers (required)\n"
        "- Each integer is an index from the provided thoughts array\n"
        "- Order by relevance (most relevant first)\n"
        "- Be BROAD and INCLUSIVE in your matches - include anything potentially related\n"
        "- Don't be too strict - if there's even a loose connection, include it\n"
        "- Return up to max_results indices (you can return fewer but try to be generous)\n"
        "- Return empty array [] only if truly nothing is relevant\n\n"
        "Example output:\n"
        '{"relevant_indices": [2, 7, 15, 8, 1, 20]}\n\n'
        "Do NOT include any other text, explanation, or formatting. Only return the JSON object."
    )

    print(f"[DEBUG] prompt={prompt}")

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": settings.GROQ_MODEL,
                "messages": [
                    {"role": "user", "content": prompt},
                ],
                "temperature": 0,
                "max_tokens": 2000,
                "response_format": {"type": "json_object"},
            },
        )

    data = resp.json()

    # Flatten entire response to string and search for JSON
    full_text = str(data).replace("\n", "")

    # Find the JSON object containing "relevant_indices"
    start = full_text.find('{"relevant_indices"')
    if start == -1:
        start = full_text.find("{'relevant_indices'")

    end = full_text.find('}', start) + 1
    json_str = full_text[start:end]

    result = json.loads(json_str)
    relevant_indices = result["relevant_indices"]

    print(f"[DEBUG] {relevant_indices=}")

    # Build output using the relevant indices
    out: list[ThoughtOut] = []
    for idx in relevant_indices[:req.topK]:
        r = rows[idx]
        tags = json.loads(r[6]) if r[6] else []
        entities = json.loads(r[7]) if r[7] else []
        out.append(
            ThoughtOut(
                id=r[0],
                user_id=r[1],
                source=r[2],
                title=r[3],
                summary=r[4],
                content=r[5],
                tags=tags,
                entities=entities,
                interpretation=r[8],
                created_at=r[9],
            )
        )
    return out

    # === OLD CODE COMMENTED OUT (FTS + Groq query expansion) ===
    # expanded = q
    # if settings.GROQ_API_KEY and settings.GROQ_MODEL:
    #     messages = [
    #         {
    #             "role": "system",
    #             "content": (
    #                 "Return only JSON with key 'fts'. 'fts' is a concise SQLite FTS query for matching relevant thoughts. "
    #                 "Use OR between key terms, and quote multi-word phrases."
    #             ),
    #         },
    #         {"role": "user", "content": q},
    #     ]
    #     try:
    #         with httpx.Client(timeout=12.0) as client:
    #             resp = client.post(
    #                 "https://api.groq.com/openai/v1/chat/completions",
    #                 headers={
    #                     "Authorization": f"Bearer {settings.GROQ_API_KEY}",
    #                     "Content-Type": "application/json",
    #                 },
    #                 json={
    #                     "model": settings.GROQ_MODEL,
    #                     "messages": messages,
    #                     "temperature": 0,
    #                     "max_tokens": 100,
    #                     "response_format": {"type": "json_object"},
    #                 },
    #             )
    #         if resp.status_code == 200:
    #             data = resp.json()
    #             choice = (data.get("choices") or [{}])[0]
    #             content = ((choice.get("message") or {}).get("content") or "").strip()
    #             try:
    #                 obj = json.loads(content)
    #                 fts = obj.get("fts")
    #                 if isinstance(fts, str) and fts.strip():
    #                     expanded = fts.strip()
    #             except Exception:
    #                 pass
    #     except Exception:
    #         pass

    # def _sanitize(s: str) -> str:
    #     # Remove most punctuation and collapse whitespace (keep quotes to allow exact phrases)
    #     import re
    #     s2 = re.sub(r'[^A-Za-z0-9\s\"]+', ' ', s)
    #     s2 = " ".join(s2.split())
    #     return s2 or q

    # sql = text(
    #     """
    #     SELECT t.id, t.user_id, t.source, t.title, t.summary, t.content,
    #            t.tags_json, t.entities_json, t.interpretation, t.created_at
    #     FROM thoughts_fts
    #     JOIN thoughts t ON t.id = thoughts_fts.thought_id
    #     WHERE t.user_id = :uid AND thoughts_fts MATCH :q
    #     ORDER BY bm25(thoughts_fts)
    #     LIMIT :k
    #     """
    # )
    # with engine.begin() as conn:
    #     try:
    #         rows = conn.execute(sql, {"q": expanded, "k": req.topK, "uid": user_id}).fetchall()
    #     except OperationalError:
    #         # Fallback: sanitize/quote raw query if Groq expansion caused FTS syntax errors
    #         try:
    #             cleaned = _sanitize(expanded)
    #             if not any(ch.isalnum() for ch in cleaned):
    #                 raise OperationalError("", {}, None)  # force next fallback
    #             rows = conn.execute(sql, {"q": cleaned, "k": req.topK, "uid": user_id}).fetchall()
    #         except OperationalError:
    #             quoted = '"' + q.replace('"', '') + '"'
    #             rows = conn.execute(sql, {"q": quoted, "k": req.topK, "uid": user_id}).fetchall()
    # out: list[ThoughtOut] = []
    # for r in rows:
    #     tags = []
    #     entities = []
    #     try:
    #         if r[6]:
    #             tags = json.loads(r[6]) or []
    #     except Exception:
    #         tags = []
    #     try:
    #         if r[7]:
    #             entities = json.loads(r[7]) or []
    #     except Exception:
    #         entities = []
    #     out.append(
    #         ThoughtOut(
    #             id=r[0],
    #             user_id=r[1],
    #             source=r[2],
    #             title=r[3],
    #             summary=r[4],
    #             content=r[5],
    #             tags=tags,
    #             entities=entities,
    #             interpretation=r[8],
    #             created_at=r[9],
    #         )
    #     )
    # return out


@router.post("/assist-comment", response_model=AssistCommentResponse, dependencies=[Depends(require_api_key)])
def assist_comment(req: AssistCommentRequest, user_id: str = Depends(get_user_id)):
    q = (req.query or "").strip()
    if not q:
        return {"text": "I couldn't hear a question. Try asking about your notes or projects."}

    # First, retrieve topK thoughts like assist-search-full but without GROQ expansion
    sql = text(
        """
        SELECT t.id, t.user_id, t.source, t.title, t.summary, t.content,
               t.tags_json, t.entities_json, t.interpretation, t.created_at
        FROM thoughts_fts
        JOIN thoughts t ON t.id = thoughts_fts.thought_id
        WHERE t.user_id = :uid AND thoughts_fts MATCH :q
        ORDER BY bm25(thoughts_fts)
        LIMIT :k
        """
    )
    with engine.begin() as conn:
        try:
            rows = conn.execute(sql, {"q": q, "k": req.topK, "uid": user_id}).fetchall()
        except OperationalError:
            # basic sanitization fallback
            import re
            cleaned = re.sub(r'[^A-Za-z0-9\s\"]+', ' ', q)
            cleaned = " ".join(cleaned.split()) or q
            rows = conn.execute(sql, {"q": cleaned, "k": req.topK, "uid": user_id}).fetchall()

    if not rows:
        return {"text": "I couldn't find anything relevant to comment on."}

    # Build a compact context
    items = []
    for r in rows:
        try:
            tags = json.loads(r[6]) if r[6] else []
        except Exception:
            tags = []
        title = r[3] or "(untitled)"
        content = (r[5] or "").strip()
        summary = (r[4] or "").strip()
        items.append({
            "title": title,
            "summary": summary,
            "content": content,
            "tags": tags,
            "created_at": str(r[9]),
            "source": r[2],
        })

    # Use Groq LLM to craft a brief commentary (1–2 sentences)
    if not settings.GROQ_API_KEY or not settings.GROQ_MODEL:
        # Fallback local summarization
        top = items[0]
        base = top.get("summary") or top.get("content")
        text = (f"Top match: {top.get('title')}. " + (base[:240] if base else "")).strip()
        return {"text": text or "Here are some notes I found."}

    system = (
        "You are a helpful assistant. Given a user query and a short list of notes (title, summary/content, tags), "
        "produce a single concise spoken comment (1–2 sentences, <45 words) that relates the notes to the query. "
        "Do not list too many details; keep it brief and conversational."
    )
    user = {
        "query": q,
        "notes": items,
    }
    try:
        with httpx.Client(timeout=12.0) as client:
            resp = client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.GROQ_MODEL,
                    "messages": [
                        {"role": "system", "content": system},
                        {"role": "user", "content": json.dumps(user)},
                    ],
                    "temperature": 0.3,
                    "max_tokens": 120,
                },
            )
        if resp.status_code == 200:
            data = resp.json()
            choice = (data.get("choices") or [{}])[0]
            content = ((choice.get("message") or {}).get("content") or "").strip()
            if content:
                return {"text": content}
    except Exception:
        pass

    # Final fallback
    top = items[0]
    base = top.get("summary") or top.get("content")
    text = (f"Top match: {top.get('title')}. " + (base[:240] if base else "")).strip()
    return {"text": text or "Here are some notes I found."}
