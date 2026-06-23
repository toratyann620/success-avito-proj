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


def _load_remote_url_from_db():
    try:
        conn = sqlite3.connect(DB_PATH)
        row = conn.execute(
            "SELECT value FROM settings WHERE key='ollama_remote_url'"
        ).fetchone()
        conn.close()
        if row and row[0]:
            os.environ["OLLAMA_REMOTE_URL"] = row[0]
    except Exception:
        pass


_load_remote_url_from_db()


class WatchPathRequest(BaseModel):
    path: str
    label: str


class ModelUpdateRequest(BaseModel):
    model: str


# ANTHROPIC_API_KEY が設定されている場合のみ選択肢に追加するClaudeモデル一覧。
# 選択すると会話内容がAnthropicのクラウドAPIへ送信される（完全ローカル要件のオプトイン例外）。
CLAUDE_MODELS = ["claude-haiku-4-5-20251001", "claude-sonnet-4-6"]


def _get_claude_models() -> list[str]:
    """ANTHROPIC_API_KEYが設定されている場合のみClaudeモデルの選択肢を返す"""
    if os.getenv("ANTHROPIC_API_KEY", "").startswith("sk-ant-"):
        return CLAUDE_MODELS
    return []


async def _fetch_available_models() -> list[str]:
    """Ollamaにインストール済みのモデル名一覧 + （設定時のみ）Claudeモデルを取得する"""
    ollama_models = []
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            res = await client.get(f"{llm_client.ollama_base_url}/api/tags")
            res.raise_for_status()
            data = res.json()
            ollama_models = [m["name"] for m in data.get("models", [])]
    except Exception as e:
        logger.warning(f"Ollamaモデル一覧取得エラー: {e}")

    remote_url = os.getenv("OLLAMA_REMOTE_URL", "")
    if remote_url:
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                res = await client.get(
                    f"{remote_url.rstrip('/')}/api/tags",
                    headers={"ngrok-skip-browser-warning": "true"},
                )
                for m in res.json().get("models", []):
                    ollama_models.append(f"remote/{m['name']}")
        except Exception as e:
            logger.warning(f"外部Ollama ({remote_url}) への接続に失敗: {e}")

    return ollama_models + _get_claude_models()


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
    """使用するモデルを切り替える（Ollamaモデル、または設定済みの場合のみClaudeモデル）"""
    available_models = await _fetch_available_models()
    if request.model not in available_models:
        if request.model.startswith("claude-"):
            detail = (
                f"モデルが見つかりません: {request.model}"
                "（ANTHROPIC_API_KEYが未設定、または対応していないモデル名です）"
            )
        elif request.model.startswith("remote/"):
            if not os.getenv("OLLAMA_REMOTE_URL", ""):
                raise HTTPException(
                    status_code=400,
                    detail="外部OllamaのURLが設定されていません。設定画面でURLを入力してください。",
                )
            detail = f"外部Ollamaモデルが見つかりません: {request.model}"
        else:
            detail = f"モデルが見つかりません: {request.model}（先に `ollama pull {request.model}` を実行してください）"
        raise HTTPException(status_code=400, detail=detail)

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


class RemoteUrlRequest(BaseModel):
    url: str


@router.get("/remote-url")
async def get_remote_url():
    """外部OllamaのURLと接続状態を返す"""
    url = os.getenv("OLLAMA_REMOTE_URL", "")
    connected = False
    if url:
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.get(
                    f"{url.rstrip('/')}/api/tags",
                    headers={"ngrok-skip-browser-warning": "true"},
                )
                connected = res.status_code == 200
        except Exception:
            connected = False
    return {"url": url, "connected": connected}


@router.patch("/remote-url")
async def update_remote_url(request: RemoteUrlRequest):
    """外部OllamaのURLを保存してリアルタイム反映する"""
    url = request.url.strip()

    # URLの形式検証
    if url and not (url.startswith("http://") or url.startswith("https://")):
        raise HTTPException(
            status_code=400,
            detail="URLは http:// または https:// で始まる必要があります",
        )

    # DBに保存
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('ollama_remote_url', ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (url,),
        )
        conn.commit()
    finally:
        conn.close()

    # リアルタイム反映
    os.environ["OLLAMA_REMOTE_URL"] = url

    logger.info(f"外部OllamaのURLを設定しました: {url}")
    return {"url": url, "message": "外部OllamaのURLを設定しました"}
