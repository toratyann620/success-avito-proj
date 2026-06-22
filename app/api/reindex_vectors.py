import os
import sqlite3
from loguru import logger
from services.vector_engine import vector_engine

DB_PATH = os.getenv("SQLITE_DB_PATH", "/data/sqlite/knowledge.db")


def reindex_all():
    """SQLiteの documents_fts から全文書を取得し、ChromaDBにベクトル登録する"""
    logger.info("--- 既存文書のベクトル再インデックス化バッチ ---")
    logger.info(f"DBパス: {DB_PATH}")

    if not os.path.exists(DB_PATH):
        logger.error(f"データベースファイルが見つかりません。パスを確認してください: {DB_PATH}")
        return

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        cursor = conn.cursor()
        # documents_fts から全文書のデータを取得
        cursor.execute("SELECT doc_id, file_path, file_name, content FROM documents_fts")
        rows = cursor.fetchall()
        total = len(rows)
        logger.info(f"データベース内に登録済みの文書: {total} 件")

        if total == 0:
            logger.info("再インデックス対象の文書がありません。処理を終了します。")
            return

        success_count = 0
        for i, row in enumerate(rows):
            doc_id = row["doc_id"]
            file_path = row["file_path"]
            file_name = row["file_name"]
            content = row["content"]

            logger.info(f"[{i+1}/{total}] ベクトルインデックス登録中: {file_name}")
            try:
                # ベクトル化して保存
                vector_engine.index_document(doc_id, file_name, content)
                success_count += 1
            except Exception as e:
                logger.error(f"ベクトルインデックス登録失敗 [{file_name}]: {e}")

        logger.info(f"--- 再インデックス完了: 成功 {success_count} / {total} 件 ---")
    except sqlite3.OperationalError as e:
        logger.error(f"SQLiteの操作中にエラーが発生しました（テーブル未作成の可能性があります）: {e}")
    finally:
        conn.close()


if __name__ == "__main__":
    reindex_all()
