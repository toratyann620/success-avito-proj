"""
NL2SQL エンジンモジュール
自然言語から安全にSQLを自動生成し、読み取り専用接続で実行する
"""
import os
import re
import httpx
from sqlalchemy import create_engine, text
from loguru import logger

from step2.schema_catalog.catalog_manager import catalog_manager
from step2.audit_log.audit_service import audit_service

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:1.5b")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "300"))

# SQLite読み取り専用接続用のURI設定
# mode=ro を指定することで、DBファイル自体への書き込みをエンジンレベルで防止する
DB_URI = os.getenv("BUSINESS_DB_URI", "sqlite:////data/sqlite/business.db?mode=ro")


class NL2SQLEngine:
    """NL2SQL変換・安全実行エンジンクラス"""

    def __init__(self):
        self.engine = create_engine(DB_URI, connect_args={"check_same_thread": False})
        # 禁止キーワード（大文字小文字無視、部分一致）
        self.forbidden_keywords = [
            r"\binsert\b", r"\bupdate\b", r"\bdelete\b", 
            r"\bdrop\b", r"\balter\b", r"\bcreate\b", 
            r"\btruncate\b", r"\breplace\b", r"\bgrant\b", 
            r"\brevoke\b", r"\bexecute\b", r"\bexec\b",
            r"\bcommit\b", r"\brollback\b"
        ]

    def is_safe_query(self, sql: str) -> tuple[bool, str]:
        """SQLが安全（読み取り専用、複数文なし）か検証する"""
        clean_sql = sql.strip().lower()
        
        # 1. 基本的な SELECT で始まっているか
        if not clean_sql.startswith("select") and not clean_sql.startswith("with"):
            return False, "SQLは SELECT または WITH で開始される必要があります。"

        # 2. 禁止コマンド/キーワードが含まれていないか
        for kw in self.forbidden_keywords:
            if re.search(kw, clean_sql):
                clean_kw = kw.replace(r"\b", "")
                return False, f"禁止された操作キーワードが検出されました: {clean_kw}"

        # 3. 複数クエリの実行を防ぐため、末尾以外のセミコロンをチェック
        # （SQLインジェクション対策）
        split_semicolons = clean_sql.split(";")
        non_empty_queries = [q.strip() for q in split_semicolons if q.strip()]
        if len(non_empty_queries) > 1:
            return False, "一度に実行できるSQLは1つのみです（セミコロンによる複数実行の禁止）。"

        return True, ""

    async def generate_sql(self, user_query: str) -> str:
        """ユーザーの自然言語質問からSQLを自動生成する (ローカルLLM / OLLAMA_MODEL)"""
        logger.info(f"NL2SQL生成開始: {user_query}")
        
        # 業務カタログから、質問に関連するテーブルのみに絞ったスキーマコンテキストを取得
        # （catalog.yaml全体を毎回埋め込むとプロンプトが肥大化し、軽量モデルで遅延・タイムアウトするため）
        catalog_context = catalog_manager.get_relevant_prompt_context(user_query)
        logger.info(f"カタログコンテキスト文字数: {len(catalog_context)}")

        system_prompt = f"""あなたはリレーショナルデータベース（SQLite）のSQLクエリ作成の専門家です。
ユーザーの自然言語によるデータ分析やレポート作成の要求を、適切なSQLクエリ（SELECT文）に変換してください。

以下の【データベースカタログ】を厳密に遵守してSQLを作成してください。存在しないテーブルやカラムは絶対に使用しないでください。
また、出力は純粋なSQLクエリ（1行または複数行）のみとし、余計な説明文や解説は一切含めないでください。

【データベースカタログ】
{catalog_context}

【制約事項】
1. 必ず 'SELECT' または 'WITH' で始まる読み取り専用クエリを1つだけ作成し、末尾に ';' を付けてください。
2. テーブル結合・計算式は、カタログで定義されたJOIN条件・KPI計算例に従ってください。
3. 返答には解説を一切含めず、```sql ... ``` で囲まれたSQLコードブロックのみを出力してください。
"""

        payload = {
            "model": OLLAMA_MODEL,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"質問: {user_query}\nSQL:"}
            ],
            "stream": False,
            "options": {
                "temperature": 0.0, # 精度を上げるため、ランダム性を排除
                "top_p": 0.9,
                "num_predict": 150
            }
        }

        try:
            async with httpx.AsyncClient(timeout=OLLAMA_TIMEOUT) as client:
                response = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
                response.raise_for_status()
                data = response.json()
                raw_response = data["message"]["content"]
                
                # マークダウンブロックからSQLを取り出す
                sql_match = re.search(r"```(?:sql)?(.*?)```", raw_response, re.DOTALL | re.IGNORECASE)
                if sql_match:
                    sql = sql_match.group(1).strip()
                else:
                    sql = raw_response.strip()
                    
                # 不要な改行や余計な記号を除去
                sql = re.sub(r";+$", "", sql) + ";" # 末尾のセミコロンを1つに統一
                logger.info(f"Generated SQL: {sql}")
                return sql
                
        except Exception as e:
            logger.error(f"SQL自動生成中にエラーが発生しました: {e}")
            raise RuntimeError(f"Ollama接続エラーまたはSQL自動生成失敗: {e}")

    def execute_sql(self, sql: str, limit: int = 100, session_id: str = None) -> list[dict]:
        """SQLを安全に実行し、結果を辞書リストで返す。監査ログを自動記録する"""
        import time
        start_time = time.time()
        
        # 1. SQLチェック
        is_safe, error_msg = self.is_safe_query(sql)
        if not is_safe:
            logger.warning(f"❌ 不正なSQLの実行をブロックしました: {error_msg} (SQL: {sql})")
            # 失敗ログの書き込み
            audit_service.log_action(
                action_type="NL2SQL_BLOCKED",
                session_id=session_id,
                detail={"sql": sql, "error_msg": error_msg, "status": "blocked"}
            )
            raise PermissionError(f"セキュリティチェック失敗: {error_msg}")

        # 2. クエリの実行件数制限
        clean_sql = sql.strip().rstrip(";")
        if "limit" not in clean_sql.lower():
            clean_sql = f"{clean_sql} LIMIT {limit};"
        else:
            clean_sql = f"{clean_sql};"

        logger.info(f"Executing SQL: {clean_sql}")
        
        try:
            # 3. 読み取り専用コネクションで実行
            with self.engine.connect() as conn:
                result = conn.execute(text(clean_sql))
                keys = result.keys()
                rows = [dict(zip(keys, row)) for row in result.fetchall()]
                
                # 実行時間計算
                duration_ms = int((time.time() - start_time) * 1000)
                logger.success(f"SQL実行成功: {len(rows)}行取得 ({duration_ms}ms)")
                
                # 成功ログの書き込み
                audit_service.log_action(
                    action_type="NL2SQL_EXECUTION",
                    session_id=session_id,
                    detail={
                        "sql": clean_sql, 
                        "status": "success", 
                        "row_count": len(rows),
                        "duration_ms": duration_ms
                    }
                )
                return rows
        except Exception as e:
            duration_ms = int((time.time() - start_time) * 1000)
            logger.error(f"SQL実行エラー: {e}")
            # エラーログの書き込み
            audit_service.log_action(
                action_type="NL2SQL_ERROR",
                session_id=session_id,
                detail={
                    "sql": clean_sql, 
                    "status": "error", 
                    "error_msg": str(e),
                    "duration_ms": duration_ms
                }
            )
            raise


# シングルトンインスタンス
nl2sql_engine = NL2SQLEngine()

if __name__ == "__main__":
    # 簡易ユニットテスト
    import asyncio
    engine = NL2SQLEngine()
    
    # 安全性テスト
    safe, msg = engine.is_safe_query("SELECT * FROM customers;")
    print(f"Test SELECT: safe={safe}, msg={msg}")
    
    safe, msg = engine.is_safe_query("DROP TABLE customers;")
    print(f"Test DROP (Should be False): safe={safe}, msg={msg}")
    
    # DB接続テスト
    try:
        rows = engine.execute_sql("SELECT * FROM customers;")
        print(f"Test Execution: {rows}")
    except Exception as e:
        print(f"Test Execution Failed: {e}")
