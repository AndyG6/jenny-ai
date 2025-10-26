from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.db import init_db
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


@app.get("/health")
def health():
    return {"ok": True}
