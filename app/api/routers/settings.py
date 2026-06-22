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
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from loguru import logger

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


class WatchPathRequest(BaseModel):
    path: str
    label: str


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
    if not os.path.isdir(request.path):
        raise HTTPException(
            status_code=400,
            detail=f"指定されたパスはコンテナ内に存在しません: {request.path}（docker-compose.ymlでのマウント設定を確認してください）",
        )

    conn = sqlite3.connect(DB_PATH)
    try:
        try:
            cursor = conn.execute(
                "INSERT INTO watch_paths (path, label) VALUES (?, ?)",
                (request.path, request.label),
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

    logger.info(f"watch-path登録: {request.label} ({request.path})")
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
