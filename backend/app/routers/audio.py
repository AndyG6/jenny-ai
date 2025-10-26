from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response
from pydantic import BaseModel

from app.config import settings
from app.services.tts import synthesize

router = APIRouter()


def require_api_key(x_api_key: Optional[str] = Header(default=None)):
    if settings.API_KEY and x_api_key != settings.API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


class TTSRequest(BaseModel):
    text: str
    voice: Optional[str] = "alloy"
    format: Optional[str] = "mp3"


@router.post("/tts", dependencies=[Depends(require_api_key)])
async def tts(req: TTSRequest):
    audio = await synthesize(req.text, req.voice or "alloy", req.format or "mp3")
    if not audio:
        raise HTTPException(status_code=400, detail="TTS synthesis failed")
    mt = "audio/mpeg" if (req.format or "mp3").lower() == "mp3" else (
        "audio/wav" if (req.format or "mp3").lower() == "wav" else "application/octet-stream"
    )
    return Response(content=audio, media_type=mt)
