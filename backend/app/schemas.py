from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, Field


class ThoughtCreate(BaseModel):
    content: str
    title: Optional[str] = None
    source: Optional[str] = "manual"


class ThoughtOut(BaseModel):
    id: str
    user_id: str
    source: str
    title: Optional[str] = None
    summary: Optional[str] = None
    content: str
    tags: List[str] = Field(default_factory=list)
    entities: List[str] = Field(default_factory=list)
    interpretation: Optional[str] = None
    created_at: datetime


class CreateResponse(BaseModel):
    thoughtId: str


class SearchRequest(BaseModel):
    query: str
    topK: int = 5


class SearchResult(BaseModel):
    thoughtId: str
    title: Optional[str]
    snippet: str
    score: float
    createdAt: datetime


class SearchResponse(BaseModel):
    results: List[SearchResult]


class AssistCommentRequest(BaseModel):
    query: str
    topK: int = 5


class AssistCommentResponse(BaseModel):
    text: str
