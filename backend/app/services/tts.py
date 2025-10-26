import httpx

from app.config import settings


async def synthesize(text: str, voice: str = "alloy", fmt: str = "mp3") -> bytes:
    if not settings.GROQ_API_KEY:
        return b""
    payload = {
        "model": getattr(settings, "GROQ_TTS_MODEL", "playai-tts"),
        "input": text,
        "voice": voice,
        "format": fmt,
    }
    headers = {
        "Authorization": f"Bearer {settings.GROQ_API_KEY}",
        "Content-Type": "application/json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/audio/speech",
            headers=headers,
            json=payload,
        )
    if resp.status_code == 200 and resp.content:
        return resp.content
    try:
        _ = resp.json()
    except Exception:
        pass
    return b""
