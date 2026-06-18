"""
データベース連携（NL2SQL）および監査ログ用 API ルーター
"""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from loguru import logger

from step2.nl2sql.nl2sql_engine import nl2sql_engine
from step2.audit_log.audit_service import audit_service

router = APIRouter()

class QueryRequest(BaseModel):
    query: str
    session_id: Optional[str] = None

class QueryResponse(BaseModel):
    success: bool
    sql: Optional[str] = None
    results: Optional[List[Dict[str, Any]]] = None
    error: Optional[str] = None
    duration_ms: Optional[int] = None

@router.post("/query", response_model=QueryResponse)
async def execute_nl2sql(request: QueryRequest):
    """
    自然言語の質問を受け取り、SQLを自動生成・検証した上で実行結果を返します。
    """
    logger.info(f"API: NL2SQLリクエストを受信: '{request.query}' (Session: {request.session_id})")
    
    import time
    start_time = time.time()
    
    try:
        # 1. SQLを自動生成
        generated_sql = await nl2sql_engine.generate_sql(request.query)
        
        # 2. 生成されたSQLを実行（内部で安全性チェックと監査ログ記録を行う）
        # セッションIDは監査ログの紐付け用
        results = nl2sql_engine.execute_sql(
            sql=generated_sql, 
            session_id=request.session_id or "api-default-session"
        )
        
        duration_ms = int((time.time() - start_time) * 1000)
        
        return QueryResponse(
            success=True,
            sql=generated_sql,
            results=results,
            duration_ms=duration_ms
        )
        
    except PermissionError as pe:
        # セキュリティチェックでブロックされた場合
        duration_ms = int((time.time() - start_time) * 1000)
        logger.warning(f"API: セキュリティポリシーによりブロックされました: {pe}")
        return QueryResponse(
            success=False,
            error=f"セキュリティチェック失敗: {str(pe)}",
            duration_ms=duration_ms
        )
        
    except Exception as e:
        # その他のエラー（Ollamaのタイムアウト、SQL構文エラー等）
        duration_ms = int((time.time() - start_time) * 1000)
        logger.error(f"API: クエリ実行中にエラーが発生しました: {e}")
        return QueryResponse(
            success=False,
            error=str(e),
            duration_ms=duration_ms
        )

@router.get("/audit-logs")
async def get_audit_logs(limit: int = 50):
    """
    最近の監査ログ（NL2SQL実行履歴やセキュリティブロック履歴）の一覧を取得します。
    """
    try:
        logs = audit_service.get_recent_logs(limit=limit)
        return {"success": True, "logs": logs}
    except Exception as e:
        logger.error(f"API: 監査ログ取得エラー: {e}")
        raise HTTPException(status_code=500, detail=f"監査ログの取得に失敗しました: {str(e)}")
