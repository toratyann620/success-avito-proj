"""
検索 APIルーター
全文検索（FTS5）エンドポイント
"""
from fastapi import APIRouter, Query
from pydantic import BaseModel
from loguru import logger

from services.rag_engine import rag_engine

router = APIRouter()


class SearchResponse(BaseModel):
    results: list[dict]
    total: int
    query: str


@router.get("/", response_model=SearchResponse)
async def search(
    q: str = Query(..., description="検索キーワード"),
    top_k: int = Query(10, description="取得件数"),
):
    """全文検索"""
    logger.info(f"検索: {q}")
    results = rag_engine.search_fts(q, top_k=top_k)
    return SearchResponse(
        results=[
            {
                "file_name": r.file_name,
                "file_path": r.file_path,
                "snippet": r.snippet,
                "score": r.score,
            }
            for r in results
        ],
        total=len(results),
        query=q,
    )
