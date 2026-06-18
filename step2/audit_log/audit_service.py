"""
監査ログ・実行履歴管理モジュール
NL2SQL等のデータ処理アクションをSQLite (knowledge.db) に記録する
"""
import os
import sqlite3
import json
from loguru import logger
from datetime import datetime

# RAG/システム管理用DBへのパス
SQLITE_DB_PATH = os.getenv("SQLITE_DB_PATH", "/data/sqlite/knowledge.db")


class AuditService:
    """監査ログサービス"""

    def __init__(self, db_path: str = SQLITE_DB_PATH):
        self.db_path = db_path

    def log_action(
        self,
        action_type: str,
        user_id: str = "local_user",
        session_id: str = None,
        detail: dict = None
    ):
        """アクションログをDBにインサートする"""
        logger.info(f"📝 監査ログ記録: {action_type} (User: {user_id})")
        
        detail_json = json.dumps(detail or {}, ensure_ascii=False)
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.cursor()
            cursor.execute("""
                INSERT INTO audit_log (action_type, user_id, session_id, detail, created_at)
                VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            """, (
                action_type,
                user_id,
                session_id,
                detail_json
            ))
            conn.commit()
            logger.debug("✅ 監査ログの書き込みが完了しました。")
        except Exception as e:
            logger.error(f"監査ログの記録中にエラーが発生しました: {e}")
        finally:
            conn.close()

    def get_logs(self, limit: int = 50) -> list[dict]:
        """監査ログの履歴を取得する"""
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            cursor = conn.cursor()
            cursor.execute("""
                SELECT id, action_type, user_id, session_id, detail, created_at
                FROM audit_log
                ORDER BY id DESC
                LIMIT ?
            """, (limit,))
            rows = cursor.fetchall()
            logs = []
            for row in rows:
                detail_data = {}
                try:
                    detail_data = json.loads(row["detail"])
                except Exception:
                    pass
                
                logs.append({
                    "id": row["id"],
                    "action_type": row["action_type"],
                    "user_id": row["user_id"],
                    "session_id": row["session_id"],
                    "detail": detail_data,
                    "created_at": row["created_at"]
                })
            return logs
        except Exception as e:
            logger.error(f"監査ログの取得中にエラーが発生しました: {e}")
            return []
        finally:
            conn.close()

    def get_recent_logs(self, limit: int = 50) -> list[dict]:
        """監査ログの履歴を取得する (get_logsのエイリアス)"""
        return self.get_logs(limit=limit)


# シングルトンインスタンス
audit_service = AuditService()

if __name__ == "__main__":
    # 簡易ユニットテスト
    service = AuditService()
    service.log_action(
        action_type="NL2SQL_TEST",
        user_id="test_runner",
        session_id="test-session-123",
        detail={"sql": "SELECT 1;", "status": "success"}
    )
    logs = service.get_logs(limit=5)
    print("Latest Audit Logs:")
    for log in logs:
        print(log)
