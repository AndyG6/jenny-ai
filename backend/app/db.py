import json
import uuid
from datetime import datetime
from typing import Generator

from sqlalchemy import Column, DateTime, String, Text, create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

from app.config import settings

_is_sqlite = settings.DATABASE_URL.startswith("sqlite")
engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False} if _is_sqlite else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


class Thought(Base):
    __tablename__ = "thoughts"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id = Column(String, nullable=False, index=True)
    source = Column(String, default="manual")
    title = Column(String, nullable=True)
    summary = Column(Text, nullable=True)
    content = Column(Text, nullable=False)
    tags_json = Column(Text, nullable=True)
    entities_json = Column(Text, nullable=True)
    interpretation = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False, index=True)


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    with engine.begin() as conn:
        conn.exec_driver_sql(
            """
            CREATE VIRTUAL TABLE IF NOT EXISTS thoughts_fts
            USING fts5(
                title,
                content,
                tags_text,
                thought_id UNINDEXED
            )
            """
        )
    if _is_sqlite:
        with engine.begin() as conn:
            rows = conn.exec_driver_sql("PRAGMA table_info('thoughts')").fetchall()
            cols = {r[1] for r in rows}
            if "interpretation" not in cols:
                conn.exec_driver_sql("ALTER TABLE thoughts ADD COLUMN interpretation TEXT")


def upsert_thought_fts(thought: Thought) -> None:
    tags = []
    if thought.tags_json:
        try:
            tags = json.loads(thought.tags_json) or []
        except Exception:
            tags = []
    tags_text = " ".join(tags)
    with engine.begin() as conn:
        conn.exec_driver_sql("DELETE FROM thoughts_fts WHERE thought_id = ?", (thought.id,))
        conn.exec_driver_sql(
            "INSERT INTO thoughts_fts (title, content, tags_text, thought_id) VALUES (?, ?, ?, ?)",
            (thought.title or "", thought.content, tags_text, thought.id),
        )


def delete_thought_fts(thought_id: str) -> None:
    with engine.begin() as conn:
        conn.exec_driver_sql("DELETE FROM thoughts_fts WHERE thought_id = ?", (thought_id,))


def get_db() -> Generator:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
