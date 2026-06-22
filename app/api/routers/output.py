"""
出力生成 APIルーター
チャット履歴をもとにExcel/Word/PowerPointファイルを生成する。
ファイル生成ロジック自体は documents.py の既存関数をそのまま再利用する。
"""
import os
import sqlite3
import uuid
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from loguru import logger

from services.llm_client import llm_client, DOCUMENT_GENERATION_PROMPT, ESTIMATE_EXTRACTION_PROMPT
from routers.documents import _generate_word, _generate_excel, _generate_pptx

router = APIRouter()

DB_PATH = os.getenv("SQLITE_DB_PATH", "/data/sqlite/knowledge.db")
OUTPUT_FILES_DIR = Path(os.getenv("OUTPUT_FILES_DIR", "/data/output_files"))

MAX_HISTORY_CHARS = 4000  # LLMへ渡す履歴コンテキストの最大文字数

FORMAT_CONFIG = {
    "excel": {
        "doc_type_label": "Excel（見積書・データ表）",
        "generator": _generate_excel,
        "extension": "xlsx",
        "media_type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
    "word": {
        "doc_type_label": "Word文書（報告書等）",
        "generator": _generate_word,
        "extension": "docx",
        "media_type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    "powerpoint": {
        "doc_type_label": "PowerPointスライド",
        "generator": _generate_pptx,
        "extension": "pptx",
        "media_type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    },
}


def _ensure_storage():
    """output_files テーブルと保存先ディレクトリを用意する"""
    OUTPUT_FILES_DIR.mkdir(parents=True, exist_ok=True)
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS output_files (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id   TEXT NOT NULL,
                file_name    TEXT NOT NULL,
                file_path    TEXT NOT NULL UNIQUE,
                format       TEXT NOT NULL,
                size         INTEGER NOT NULL DEFAULT 0,
                created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
    finally:
        conn.close()


_ensure_storage()


class OutputGenerateRequest(BaseModel):
    session_id: str
    format: str  # "excel" | "word" | "powerpoint"
    instruction: str = ""


def _get_chat_history_text(session_id: str) -> str:
    """セッションの会話履歴を、LLMへ渡すコンテキスト文字列に整形する"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT role, content FROM chat_history WHERE session_id = ? ORDER BY created_at ASC",
            (session_id,),
        ).fetchall()
    finally:
        conn.close()

    lines = []
    total_chars = 0
    for row in rows:
        speaker = "ユーザー" if row["role"] == "user" else "AI"
        line = f"【{speaker}】{row['content']}"
        if total_chars + len(line) > MAX_HISTORY_CHARS:
            break
        lines.append(line)
        total_chars += len(line)

    return "\n".join(lines)


@router.post("/generate")
async def generate_output(request: OutputGenerateRequest):
    """チャット履歴からExcel/Word/PowerPointファイルを生成する"""
    config = FORMAT_CONFIG.get(request.format)
    if not config:
        raise HTTPException(status_code=400, detail=f"未対応のformatです: {request.format}（excel/word/powerpointのいずれか）")

    history_text = _get_chat_history_text(request.session_id)
    if not history_text:
        raise HTTPException(status_code=404, detail=f"セッションの会話履歴が見つかりません: {request.session_id}")

    instruction = request.instruction.strip() or "チャット履歴全体の内容を踏まえて、要点を整理した内容を自動的に判断して作成してください。"

    logger.info(f"出力生成リクエスト: session={request.session_id}, format={request.format}")

    if request.format == "excel":
        prompt = ESTIMATE_EXTRACTION_PROMPT.format(context=history_text)
    else:
        prompt = DOCUMENT_GENERATION_PROMPT.format(
            doc_type=config["doc_type_label"],
            requirements=instruction,
            context=history_text,
        )

    try:
        draft_content = await llm_client.generate(prompt)

        file_path = config["generator"](draft_content, instruction)
        generated_path = Path(file_path)

        file_name = f"AVITO_{request.format}_{datetime.now():%Y%m%d%H%M%S}.{config['extension']}"
        stored_path = OUTPUT_FILES_DIR / f"{uuid.uuid4().hex}.{config['extension']}"
        stored_path.write_bytes(generated_path.read_bytes())
        generated_path.unlink(missing_ok=True)

        size = stored_path.stat().st_size

        conn = sqlite3.connect(DB_PATH)
        try:
            cursor = conn.execute(
                "INSERT INTO output_files (session_id, file_name, file_path, format, size) VALUES (?, ?, ?, ?, ?)",
                (request.session_id, file_name, str(stored_path), request.format, size),
            )
            conn.commit()
            file_id = cursor.lastrowid
        finally:
            conn.close()

        logger.success(f"出力ファイル生成完了: {file_name} ({size} bytes)")
        return {
            "file_id": file_id,
            "file_name": file_name,
            "download_url": f"/api/output/download/{file_id}",
        }
    except Exception as e:
        logger.error(f"出力生成エラー: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/files")
async def list_output_files(session_id: str):
    """セッションで生成済みの出力ファイル一覧を取得する"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT id, file_name, format, size, created_at FROM output_files WHERE session_id = ? ORDER BY created_at DESC",
            (session_id,),
        ).fetchall()
        return {
            "files": [
                {
                    "file_id": r["id"],
                    "file_name": r["file_name"],
                    "format": r["format"],
                    "size": r["size"],
                    "created_at": r["created_at"],
                    "download_url": f"/api/output/download/{r['id']}",
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@router.get("/download/{file_id}")
async def download_output_file(file_id: int):
    """生成済みファイルをダウンロードする"""
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute(
            "SELECT file_name, file_path, format FROM output_files WHERE id = ?", (file_id,)
        ).fetchone()
    finally:
        conn.close()

    if row is None:
        raise HTTPException(status_code=404, detail=f"出力ファイルが見つかりません: id={file_id}")

    file_name, file_path, fmt = row
    if not Path(file_path).exists():
        raise HTTPException(status_code=404, detail=f"ファイルがディスク上に存在しません: {file_path}")

    return FileResponse(
        path=file_path,
        media_type=FORMAT_CONFIG[fmt]["media_type"],
        filename=file_name,
    )
