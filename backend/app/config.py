from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


class Settings(BaseSettings):
    API_KEY: str = ""
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "groq/compound"
    GROQ_STT_MODEL: str = "whisper-large-v3-turbo"
    GROQ_TTS_MODEL: str = "playai-tts"
    OPENAI_API_KEY: str = ""
    OPENAI_TRANSCRIBE_MODEL: str = "whisper-1"
    DATABASE_URL: str = "sqlite:///./local.db"
    ALLOW_ORIGINS: str = "http://localhost:8081"
    # Pydantic v2 settings config: read from .env and ignore extra keys (e.g., vapi_api_key)
    model_config = SettingsConfigDict(
        env_file=str(Path(__file__).resolve().parent.parent / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
