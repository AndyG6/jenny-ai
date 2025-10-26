from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException

from app.config import settings
from app.schemas import SearchRequest, SearchResponse
from app.routers.search import search as core_search

router = APIRouter()


def require_api_key(x_api_key: Optional[str] = Header(default=None)):
    if settings.API_KEY and x_api_key != settings.API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")


@router.post("/vapi/tools/search", response_model=SearchResponse, dependencies=[Depends(require_api_key)])
def vapi_search(req: SearchRequest):
    return core_search(req)
