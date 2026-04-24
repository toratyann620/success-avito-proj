"""
SQLite FTS5 データベース初期化・管理
全文検索インデクスとベクトルメタデータを管理する
"""
import sqlite3
import os
from pathlib import Path
from loguru import logger

DB_PATH = os.getenv("SQLITE_DB_PATH", "/data/sqlite/knowledge.db")


async def init_db():
    """DBを初期化し、テーブルを作成する"""
    db_dir = Path(DB_PATH).parent
    db_dir.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    try:
        cursor = conn.cursor()

        # FTS5 全文検索テーブル
        cursor.execute("""
            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts
            USING fts5(
                doc_id,
                file_path,
                file_name,
                content,
                tokenize='unicode61'
            )
        """)

        # ドキュメントメタデータテーブル
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                file_path   TEXT UNIQUE NOT NULL,
                file_name   TEXT NOT NULL,
                file_type   TEXT NOT NULL,
                file_size   INTEGER,
                indexed_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
                checksum    TEXT,
                is_active   BOOLEAN DEFAULT 1
            )
        """)

        # チャット履歴テーブル
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS chat_history (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id  TEXT NOT NULL,
                role        TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
                content     TEXT NOT NULL,
                sources     TEXT,  -- JSON: 参照ドキュメントリスト
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        # 監査ログテーブル（Step2 DB連携用）
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS audit_log (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                action_type   TEXT NOT NULL,
                user_id       TEXT,
                session_id    TEXT,
                detail        TEXT,  -- JSON
                created_at    DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """)

        conn.commit()
        logger.info(f"✅ SQLite DB初期化完了: {DB_PATH}")
    finally:
        conn.close()


def get_db():
    """DB接続を取得する（コンテキストマネージャ用）"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
    finally:
        conn.close()
