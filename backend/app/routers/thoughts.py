import json
from typing import List, Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session

from app.config import settings
from app.db import Thought, get_db, upsert_thought_fts, delete_thought_fts
from app.services.chroma_search import add_thought_to_chroma, delete_thought_from_chroma
from app.schemas import CreateResponse, ThoughtCreate, ThoughtOut
from app.services.metadata import extract_metadata
from app.services.transcription import transcribe_audio

router = APIRouter()


def require_api_key(x_api_key: Optional[str] = Header(default=None)):
    if settings.API_KEY and x_api_key != settings.API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


def get_user_id(x_user_id: Optional[str] = Header(default=None)) -> str:
    return x_user_id or "demo"


@router.post("/thoughts", response_model=CreateResponse, dependencies=[Depends(require_api_key)])
def create_thought(
    payload: ThoughtCreate, db: Session = Depends(get_db), user_id: str = Depends(get_user_id)
):
    meta = extract_metadata(payload.content, payload.title)
    tags_json = json.dumps(meta.get("tags", []), ensure_ascii=False)
    entities_json = json.dumps(meta.get("entities", []), ensure_ascii=False)
    t = Thought(
        user_id=user_id,
        source=payload.source or "manual",
        title=meta.get("title"),
        summary=meta.get("summary"),
        content=payload.content,
        tags_json=tags_json,
        entities_json=entities_json,
        interpretation=meta.get("interpretation"),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    upsert_thought_fts(t)

    # ChromaDB stuff
    add_thought_to_chroma(
        thought_id=t.id,
        content=t.content,
        metadata={
            "id": t.id,
            "title": t.title or "",
            "created_at": t.created_at.isoformat(),
            "source": t.source
        }
    )

    return {"thoughtId": t.id}


@router.delete("/thoughts/clear", dependencies=[Depends(require_api_key)])
def clear_thoughts(db: Session = Depends(get_db), user_id: str = Depends(get_user_id)):
    rows = db.query(Thought).filter(Thought.user_id == user_id).all()
    ids = [r.id for r in rows]
    for tid in ids:
        delete_thought_fts(tid)
        # ChromaDB stuff
        delete_thought_from_chroma(tid)
    deleted = (
        db.query(Thought).filter(Thought.user_id == user_id).delete(synchronize_session=False)
    )
    db.commit()
    return {"deleted": int(deleted)}


@router.get("/thoughts", response_model=List[ThoughtOut], dependencies=[Depends(require_api_key)])
def list_thoughts(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user_id: str = Depends(get_user_id),
):
    rows = (
        db.query(Thought)
        .filter(Thought.user_id == user_id)
        .order_by(Thought.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
    out: List[ThoughtOut] = []
    for r in rows:
        tags = []
        entities = []
        if r.tags_json:
            try:
                tags = json.loads(r.tags_json) or []
            except Exception:
                tags = []
        if r.entities_json:
            try:
                entities = json.loads(r.entities_json) or []
            except Exception:
                entities = []
        out.append(
            ThoughtOut(
                id=r.id,
                user_id=r.user_id,
                source=r.source,
                title=r.title,
                summary=r.summary,
                content=r.content,
                tags=tags,
                entities=entities,
                interpretation=r.interpretation,
                created_at=r.created_at,
            )
        )
    return out


@router.post("/thoughts/transcribe", response_model=CreateResponse, dependencies=[Depends(require_api_key)])
async def transcribe_thought(
    file: UploadFile = File(...), db: Session = Depends(get_db), user_id: str = Depends(get_user_id)
):
    text = await transcribe_audio(file)
    if not text:
        raise HTTPException(status_code=400, detail="Transcription failed")
    meta = extract_metadata(text, None)
    tags_json = json.dumps(meta.get("tags", []), ensure_ascii=False)
    entities_json = json.dumps(meta.get("entities", []), ensure_ascii=False)
    t = Thought(
        user_id=user_id,
        source="voice",
        title=meta.get("title"),
        summary=meta.get("summary"),
        content=text,
        tags_json=tags_json,
        entities_json=entities_json,
        interpretation=meta.get("interpretation"),
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    upsert_thought_fts(t)

    # ChromaDB stuff
    add_thought_to_chroma(
        thought_id=t.id,
        content=t.content,
        metadata={
            "id": t.id,
            "title": t.title or "",
            "created_at": t.created_at.isoformat(),
            "source": t.source
        }
    )

    return {"thoughtId": t.id}
