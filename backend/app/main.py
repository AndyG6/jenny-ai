import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db, Thought, SessionLocal, upsert_thought_fts
from app.routers.thoughts import router as thoughts_router
from app.routers.search import router as search_router
from app.routers.vapi_tools import router as vapi_tools_router
from app.routers.audio import router as audio_router

app = FastAPI(title="Backend", version="1.0.0")

origins = [o.strip() for o in settings.ALLOW_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(thoughts_router, prefix="/v1")
app.include_router(search_router, prefix="/v1")
app.include_router(vapi_tools_router, prefix="/v1")
app.include_router(audio_router, prefix="/v1")


@app.on_event("startup")
def on_startup():
    init_db()
    db = SessionLocal()
    try:
        user_id = "demo"
        samples = [
            {"title": "Fishing startup note", "content": "Comment about the fishing startup last week.", "tags": ["fishing", "startup"]},
            {"title": "Pitch deck reminder", "content": "Reminder: prepare the pitch deck for the fintech demo on Tuesday.", "tags": ["reminder", "fintech", "pitch"]},
            {"title": "Hiring meeting notes", "content": "Meeting notes: talked to Sarah about hiring a full-stack engineer.", "tags": ["hiring", "meeting"]},
            {"title": "Creator CRM idea", "content": "Idea: lightweight CRM for solo creators with AI summaries.", "tags": ["idea", "crm", "ai"]},
            {"title": "Workout log", "content": "Workout log: 5k run in 26 minutes at the park.", "tags": ["fitness", "running"]},
            {"title": "Mic research", "content": "Research: best microphones for iOS recording in noisy rooms.", "tags": ["research", "audio", "ios"]},
        ]
        for s in samples:
            t = Thought(
                user_id=user_id,
                source="manual",
                title=s.get("title"),
                summary=None,
                content=s.get("content", ""),
                tags_json=json.dumps(s.get("tags", []), ensure_ascii=False),
                entities_json=json.dumps(s.get("entities", []), ensure_ascii=False),
                interpretation=None,
            )
            db.add(t)
        db.commit()
        rows = db.query(Thought).filter(Thought.user_id == user_id).all()
        for r in rows:
            upsert_thought_fts(r)
    finally:
        db.close()


@app.get("/health")
def health():
    return {"ok": True}
