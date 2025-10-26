from typing import Optional

import httpx
from fastapi import UploadFile

from app.config import settings


async def transcribe_audio(file: UploadFile) -> str:
    if not settings.GROQ_API_KEY:
        return ""
    filename = file.filename or "audio.m4a"
    content_type = file.content_type or "application/octet-stream"
    data = {"model": getattr(settings, "GROQ_STT_MODEL", "whisper-large-v3-turbo")}
    payload = await file.read()
    files = {"file": (filename, payload, content_type)}
    headers = {"Authorization": f"Bearer {settings.GROQ_API_KEY}"}
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/audio/transcriptions",
            headers=headers,
            data=data,
            files=files,
        )
    try:
        js = resp.json()
    except Exception:
        return ""
    return js.get("text") or ""
