"""
チャット / RAG APIルーター
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from loguru import logger
import json
import uuid

from services.rag_engine import rag_engine

router = APIRouter()


class ChatRequest(BaseModel):
    message: str
    session_id: str = None
    mode: str = "internal"  # "internal"（内部機密文書）or "proposal"（提案書）


class ChatResponse(BaseModel):
    answer: str
    sources: list[dict]
    session_id: str


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """チャット問い合わせ（RAG回答）"""
    session_id = request.session_id or str(uuid.uuid4())
    logger.info(f"チャット受信 [session={session_id}]: {request.message[:50]}...")

    try:
        result = await rag_engine.query(
            user_query=request.message,
            session_id=session_id,
        )
        return ChatResponse(
            answer=result.answer,
            sources=result.sources,
            session_id=session_id,
        )
    except Exception as e:
        logger.error(f"チャットエラー: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """チャット問い合わせ（ストリーミング回答）"""
    from services.llm_client import llm_client
    session_id = request.session_id or str(uuid.uuid4())

    async def generate():
        try:
            # まず検索を実行
            results = rag_engine.search_fts(request.message)
            context, sources = rag_engine.build_context(results)
            from services.llm_client import RAG_SYSTEM_PROMPT
            system_prompt = RAG_SYSTEM_PROMPT.format(context=context)

            # ストリーミングで回答
            async for chunk in llm_client.chat_stream([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message},
            ]):
                yield f"data: {json.dumps({'chunk': chunk, 'sources': []}, ensure_ascii=False)}\n\n"

            # 最後にソース情報を送信
            yield f"data: {json.dumps({'chunk': '', 'sources': sources, 'done': True}, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.error(f"ストリーミングエラー: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")
