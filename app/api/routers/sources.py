"""
ソース管理 APIルーター
ファイル/メモをナレッジソースとして登録・管理し、RAG検索インデックス（documents / documents_fts）に反映する
"""
import os
import re
import sqlite3
import hashlib
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
from loguru import logger

router = APIRouter()

DB_PATH = os.getenv("SQLITE_DB_PATH", "/data/sqlite/knowledge.db")
SOURCES_DIR = Path(os.getenv("SOURCES_DIR", "/data/sources"))

ALLOWED_EXTENSIONS = {
    ".pdf": "pdf",
    ".docx": "docx",
    ".xlsx": "xlsx",
    ".pptx": "pptx",
    ".txt": "txt",
}


def _ensure_storage():
    """sourcesテーブルと保存先ディレクトリを用意する"""
    SOURCES_DIR.mkdir(parents=True, exist_ok=True)
    Path(DB_PATH).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sources (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                name         TEXT NOT NULL,
                type         TEXT NOT NULL,
                size         INTEGER NOT NULL DEFAULT 0,
                file_path    TEXT NOT NULL UNIQUE,
                selected     INTEGER NOT NULL DEFAULT 1,
                uploaded_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)
        conn.commit()
    finally:
        conn.close()


_ensure_storage()


def _extract_text(path: Path, ext: str) -> str:
    """ファイルからテキストを抽出する（RAGインデクス登録用）"""
    try:
        if ext == ".txt":
            return path.read_text(encoding="utf-8", errors="ignore")
        elif ext == ".pdf":
            from pypdf import PdfReader
            reader = PdfReader(str(path))
            return "\n".join(p.extract_text() or "" for p in reader.pages)
        elif ext == ".docx":
            from docx import Document
            doc = Document(str(path))
            return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
        elif ext == ".xlsx":
            from openpyxl import load_workbook
            wb = load_workbook(str(path), read_only=True, data_only=True)
            texts = []
            for ws in wb.worksheets:
                for row in ws.iter_rows(values_only=True):
                    row_text = " ".join(str(c) for c in row if c is not None)
                    if row_text.strip():
                        texts.append(row_text)
            return "\n".join(texts)
        elif ext == ".pptx":
            from pptx import Presentation
            prs = Presentation(str(path))
            texts = []
            for slide in prs.slides:
                for shape in slide.shapes:
                    if shape.has_text_frame:
                        texts.append(shape.text_frame.text)
            return "\n".join(texts)
    except Exception as e:
        logger.warning(f"テキスト抽出エラー [{path.name}]: {e}")
    return ""


def _index_for_rag(file_path: Path, content: str):
    """既存のdocuments / documents_fts テーブルに登録し、RAG検索対象に加える"""
    if not content.strip():
        return
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()
        doc_id = str(file_path)
        checksum = hashlib.md5(content.encode("utf-8")).hexdigest()
        cursor.execute("""
            INSERT INTO documents (file_path, file_name, file_type, file_size, checksum)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(file_path) DO UPDATE SET
                checksum = excluded.checksum,
                file_size = excluded.file_size,
                updated_at = CURRENT_TIMESTAMP
        """, (doc_id, file_path.name, file_path.suffix.lower(), file_path.stat().st_size, checksum))
        cursor.execute("DELETE FROM documents_fts WHERE doc_id = ?", (doc_id,))
        cursor.execute("""
            INSERT INTO documents_fts (doc_id, file_path, file_name, content)
            VALUES (?, ?, ?, ?)
        """, (doc_id, doc_id, file_path.name, content))
        conn.commit()
    finally:
        conn.close()


def _unindex(file_path: Path):
    """documents / documents_fts からエントリを削除する"""
    doc_id = str(file_path)
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("DELETE FROM documents WHERE file_path = ?", (doc_id,))
        conn.execute("DELETE FROM documents_fts WHERE doc_id = ?", (doc_id,))
        conn.commit()
    finally:
        conn.close()


def _safe_filename(name: str) -> str:
    """パストラバーサル対策込みの保存用ファイル名を生成する"""
    base = re.sub(r"[/\\]", "_", Path(name).name)
    return f"{uuid.uuid4().hex}_{base}"


class SelectedUpdateRequest(BaseModel):
    selected: bool


class MemoRequest(BaseModel):
    title: str
    content: str


@router.get("/")
async def list_sources():
    """登録済みソースの一覧を取得する"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        rows = conn.execute(
            "SELECT id, name, type, size, uploaded_at, selected FROM sources ORDER BY uploaded_at DESC"
        ).fetchall()
        return {
            "sources": [
                {
                    "id": r["id"],
                    "name": r["name"],
                    "type": r["type"],
                    "size": r["size"],
                    "uploaded_at": r["uploaded_at"],
                    "selected": bool(r["selected"]),
                }
                for r in rows
            ]
        }
    finally:
        conn.close()


@router.post("/upload")
async def upload_source(file: UploadFile = File(...)):
    """ファイルをアップロードしてソースとして登録し、RAGインデックスに追加する"""
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"サポートされていないファイル形式です: {ext or '(拡張子なし)'}")

    content_bytes = await file.read()
    dest_path = SOURCES_DIR / _safe_filename(file.filename)
    dest_path.write_bytes(content_bytes)

    text = _extract_text(dest_path, ext)
    _index_for_rag(dest_path, text)

    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.execute(
            "INSERT INTO sources (name, type, size, file_path) VALUES (?, ?, ?, ?)",
            (file.filename, ALLOWED_EXTENSIONS[ext], len(content_bytes), str(dest_path)),
        )
        conn.commit()
        source_id = cursor.lastrowid
        row = conn.execute(
            "SELECT id, name, type, size, uploaded_at FROM sources WHERE id = ?", (source_id,)
        ).fetchone()
    finally:
        conn.close()

    logger.info(f"ソース追加: {file.filename} ({len(content_bytes)} bytes)")
    return {
        "id": row[0],
        "name": row[1],
        "type": row[2],
        "size": row[3],
        "uploaded_at": row[4],
    }


@router.patch("/{source_id}")
async def update_source_selection(source_id: int, request: SelectedUpdateRequest):
    """ソースの選択状態（チャットコンテキストに含めるか）を更新する"""
    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.execute(
            "UPDATE sources SET selected = ? WHERE id = ?",
            (1 if request.selected else 0, source_id),
        )
        conn.commit()
        if cursor.rowcount == 0:
            raise HTTPException(status_code=404, detail=f"ソースが見つかりません: id={source_id}")
    finally:
        conn.close()
    return {"id": source_id, "selected": request.selected}


@router.delete("/{source_id}")
async def delete_source(source_id: int):
    """ソースを削除し、RAGインデックスからも除外する"""
    conn = sqlite3.connect(DB_PATH)
    try:
        row = conn.execute("SELECT file_path FROM sources WHERE id = ?", (source_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail=f"ソースが見つかりません: id={source_id}")
        file_path = Path(row[0])
        conn.execute("DELETE FROM sources WHERE id = ?", (source_id,))
        conn.commit()
    finally:
        conn.close()

    _unindex(file_path)
    if file_path.exists():
        try:
            file_path.unlink()
        except OSError as e:
            logger.warning(f"ソースファイルの削除に失敗しました [{file_path}]: {e}")

    return {"deleted": True}


@router.post("/memo")
async def create_memo_source(request: MemoRequest):
    """メモをテキストソースとして保存し、RAGインデックスに追加する"""
    dest_path = SOURCES_DIR / _safe_filename(f"{request.title}.txt")
    dest_path.write_text(request.content, encoding="utf-8")

    _index_for_rag(dest_path, request.content)

    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.execute(
            "INSERT INTO sources (name, type, size, file_path) VALUES (?, ?, ?, ?)",
            (request.title, "memo", len(request.content.encode("utf-8")), str(dest_path)),
        )
        conn.commit()
        source_id = cursor.lastrowid
        row = conn.execute(
            "SELECT id, name, uploaded_at FROM sources WHERE id = ?", (source_id,)
        ).fetchone()
    finally:
        conn.close()

    logger.info(f"メモソース追加: {request.title}")
    return {
        "id": row[0],
        "name": row[1],
        "type": "memo",
        "uploaded_at": row[2],
    }
