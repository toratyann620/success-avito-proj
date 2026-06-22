"""
設定 APIルーター
自動検索(watch-paths)の対象フォルダを管理する

注意: ここで登録する path はコンテナ内から見えるパスである必要がある。
ホストの新しいフォルダを対象に追加する場合は、事前に docker-compose.yml の
api サービスに `<ホストパス>:/mnt/watch_roots/<フォルダ名>:ro` 形式のマウントを
追記し、コンテナを再作成したうえで、そのコンテナ内パスを path として登録すること。
"""
import os
import sqlite3
import unicodedata
from pathlib import Path

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

from services.llm_client import llm_client

router = APIRouter()

DB_PATH = os.getenv("SQLITE_DB_PATH", "/data/sqlite/knowledge.db")


def _ensure_table():
    """watch_paths テーブルを用意する"""
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS watch_paths (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                path        TEXT NOT NULL UNIQUE,
                label       TEXT NOT NULL,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
    finally:
        conn.close()


_ensure_table()


def _ensure_settings_table():
    """settings テーブルを用意する"""
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        conn.commit()
    finally:
        conn.close()


_ensure_settings_table()


class WatchPathRequest(BaseModel):
    path: str
    label: str


class ModelUpdateRequest(BaseModel):
    model: str


async def _fetch_available_models() -> list[str]:
    """Ollamaにインストール済みのモデル名一覧を取得する"""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(f"{llm_client.base_url}/api/tags")
            res.raise_for_status()
            data = res.json()
            return [m["name"] for m in data.get("models", [])]
    except Exception as e:
        logger.warning(f"Ollamaモデル一覧取得エラー: {e}")
        return []


@router.get("/model")
async def get_model_settings():
    """現在使用中のモデル名と、Ollamaにインストール済みのモデル一覧を返す"""
    available_models = await _fetch_available_models()
    current_model = llm_client.model
    if current_model not in available_models:
        available_models = [current_model] + available_models

    return {
        "current_model": current_model,
        "available_models": available_models,
    }


@router.patch("/model")
async def update_model_settings(request: ModelUpdateRequest):
    """使用するOllamaモデルを切り替える"""
    available_models = await _fetch_available_models()
    if request.model not in available_models:
        raise HTTPException(
            status_code=400,
            detail=f"モデルが見つかりません: {request.model}（先に `ollama pull {request.model}` を実行してください）",
        )

    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('ollama_model', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (request.model,),
        )
        conn.commit()
    finally:
        conn.close()

    llm_client.set_model(request.model)
    logger.info(f"使用モデルを切り替えました: {request.model}")

    return {"model": request.model, "message": "モデルを切り替えました"}


@router.get("/watch-paths")
async def list_watch_paths():
    """登録済みの自動検索対象パス一覧を取得する"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT id, path, label, created_at FROM watch_paths ORDER BY created_at DESC"
        ).fetchall()
        return {
            "watch_paths": [
                {"id": r["id"], "path": r["path"], "label": r["label"], "created_at": r["created_at"]}
                for r in rows
            ]
        }
    finally:
        conn.close()


@router.post("/watch-paths")
async def create_watch_path(request: WatchPathRequest):
    """自動検索対象パスを登録する"""
    # path はコンテナ内の実マウントパスのため正規化せずそのまま使う（os.path.isdir/os.walkの実体参照キーとなるため）。
    # label は表示用テキストのみなのでNFKC正規化して表記を揃える。
    if not os.path.isdir(request.path):
        raise HTTPException(
            status_code=400,
            detail=f"指定されたパスはコンテナ内に存在しません: {request.path}（docker-compose.ymlでのマウント設定を確認してください）",
        )

    label = unicodedata.normalize("NFKC", request.label)

    conn = sqlite3.connect(DB_PATH)
    try:
        try:
            cursor = conn.execute(
                "INSERT INTO watch_paths (path, label) VALUES (?, ?)",
                (request.path, label),
            )
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=400, detail=f"このパスは既に登録されています: {request.path}")
        conn.commit()
        watch_path_id = cursor.lastrowid
        row = conn.execute(
            "SELECT id, path, label, created_at FROM watch_paths WHERE id = ?", (watch_path_id,)
        ).fetchone()
    finally:
        conn.close()

    logger.info(f"watch-path登録: {label} ({request.path})")
    return {"id": row[0], "path": row[1], "label": row[2], "created_at": row[3]}


@router.delete("/watch-paths/{watch_path_id}")
async def delete_watch_path(watch_path_id: int):
    """自動検索対象パスの登録を解除する"""
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.execute("DELETE FROM watch_paths WHERE id = ?", (watch_path_id,))
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"watch-pathが見つかりません: id={watch_path_id}")
    finally:
        conn.close()

    return {"deleted": True}
