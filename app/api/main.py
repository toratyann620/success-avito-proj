"""
AI駆動型ナレッジ検索 文書作成支援ツール
FastAPI メインエントリポイント
"""
from fastapi import FastAPI
from dotenv import load_dotenv
load_dotenv()
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from loguru import logger

from routers import chat, documents, search, voice, db_query
from services.db import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    """アプリケーション起動・終了時の処理"""
    logger.info("🚀 AI Knowledge API 起動中...")
    await init_db()
    logger.info("✅ データベース初期化完了")
    yield
    logger.info("🛑 AI Knowledge API シャットダウン")


app = FastAPI(
    title="AI駆動型ナレッジ検索 文書作成支援ツール API",
    description="スタンドアロン型・完全ローカル動作のAI文書検索・作成支援システム",
    version="0.1.0",
    lifespan=lifespan,
)

# CORS設定（ローカル開発用）
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:3002",
        "http://127.0.0.1:3002",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ルーター登録
app.include_router(chat.router, prefix="/api/chat", tags=["Chat / RAG"])
app.include_router(documents.router, prefix="/api/documents", tags=["文書生成"])
app.include_router(search.router, prefix="/api/search", tags=["検索"])
app.include_router(voice.router, prefix="/api/voice", tags=["音声認識"])
app.include_router(db_query.router, prefix="/api/db", tags=["データベース連携"])


@app.get("/health")
async def health_check():
    """ヘルスチェックエンドポイント"""
    return {"status": "ok", "service": "ai-knowledge-api"}


@app.get("/")
async def root():
    return {
        "message": "AI駆動型ナレッジ検索 文書作成支援ツール API",
        "version": "0.1.0",
        "docs": "/docs",
    }
