import json

import httpx

from app.config import settings


def _fallback(content: str, provided_title: str | None):
    title = provided_title or content.strip().split("\n")[0][:80]
    summary = content.strip()[:200]
    return {"title": title, "summary": summary, "tags": [], "entities": [], "interpretation": content}


def extract_metadata(content: str, provided_title: str | None = None):
    if not settings.GROQ_API_KEY:
        return _fallback(content, provided_title)
    messages = [
        {
            "role": "system",
            "content": (
                "You are a JSON API. Return only a compact JSON object with keys: "
                "title, summary, tags, entities, interpretation. The 'tags' and 'entities' must be arrays of strings. "
                "'interpretation' is your concise explanation (1-3 sentences) of what the user meant. "
                "Do not include any extra text."
            ),
        },
        {"role": "user", "content": content},
    ]
    try:
        with httpx.Client(timeout=20.0) as client:
            resp = client.post(
                "https://api.groq.com/openai/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {settings.GROQ_API_KEY}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": settings.GROQ_MODEL,
                    "messages": messages,
                    "temperature": 0.0,
                    "max_tokens": 300,
                    "response_format": {"type": "json_object"},
                },
            )
        if resp.status_code != 200:
            return _fallback(content, provided_title)
        data = resp.json()
        choice = (data.get("choices") or [{}])[0]
        message = choice.get("message") or {}
        text = message.get("content") or ""
        obj = None
        try:
            obj = json.loads(text)
        except Exception:
            start = text.find("{")
            end = text.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    obj = json.loads(text[start : end + 1])
                except Exception:
                    obj = None
        if not isinstance(obj, dict):
            return _fallback(content, provided_title)
        title = obj.get("title") or provided_title
        summary = obj.get("summary") or content[:200]
        tags = obj.get("tags") or []
        entities = obj.get("entities") or []
        interpretation = obj.get("interpretation") or summary or content
        if not isinstance(tags, list):
            tags = []
        if not isinstance(entities, list):
            entities = []
        return {
            "title": title,
            "summary": summary,
            "tags": tags,
            "entities": entities,
            "interpretation": interpretation,
        }
    except Exception:
        return _fallback(content, provided_title)
