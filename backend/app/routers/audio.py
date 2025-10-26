from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Response, UploadFile, File
from pydantic import BaseModel

from app.config import settings
from app.services.tts import synthesize
from app.services.transcription import transcribe_audio

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


@router.get("/tts")
async def tts_get(text: str, voice: Optional[str] = "alloy", format: Optional[str] = "mp3", key: Optional[str] = None, x_api_key: Optional[str] = Header(default=None)):
    if settings.API_KEY:
      if not (x_api_key == settings.API_KEY or key == settings.API_KEY):
          raise HTTPException(status_code=401, detail="Unauthorized")
    audio = await synthesize(text, voice or "alloy", format or "mp3")
    if not audio:
        raise HTTPException(status_code=400, detail="TTS synthesis failed")
    mt = "audio/mpeg" if (format or "mp3").lower() == "mp3" else (
        "audio/wav" if (format or "mp3").lower() == "wav" else "application/octet-stream"
    )
    return Response(content=audio, media_type=mt)


@router.post("/transcribe", dependencies=[Depends(require_api_key)])
async def transcribe(file: UploadFile = File(...)):
    text = await transcribe_audio(file)
    if not text:
        raise HTTPException(status_code=400, detail="Transcription failed")
    return {"text": text}
