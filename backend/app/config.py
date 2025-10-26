from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    API_KEY: str = ""
    GROQ_API_KEY: str = ""
    GROQ_MODEL: str = "llama-3.1-70b-versatile"
    GROQ_STT_MODEL: str = "whisper-large-v3-turbo"
    GROQ_TTS_MODEL: str = "playai-tts"
    OPENAI_API_KEY: str = ""
    OPENAI_TRANSCRIBE_MODEL: str = "whisper-1"
    DATABASE_URL: str = "sqlite:///./local.db"
    ALLOW_ORIGINS: str = "http://localhost:8081"

    class Config:
        env_file = str(Path(__file__).resolve().parent.parent / ".env")
        env_file_encoding = "utf-8"


settings = Settings()
