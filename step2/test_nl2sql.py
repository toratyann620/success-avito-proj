"""
NL2SQL エンジン機能およびセキュリティのテストスクリプト
"""
import asyncio
import sys
from loguru import logger

import os
os.environ["OLLAMA_MODEL"] = "qwen2.5-coder:1.5b"
from step2.nl2sql.nl2sql_engine import OLLAMA_MODEL as ENGINE_MODEL, nl2sql_engine
logger.info(f"🔧 Active Ollama model config: {ENGINE_MODEL}")
from step2.audit_log.audit_service import audit_service

# テストケース定義
TEST_CASES = [
    {
        "id": "TC-01",
        "description": "シンプルな単一テーブルクエリ (顧客一覧)",
        "query": "登録されている顧客の名前と業種を一覧で教えてください。",
        "expect_blocked": False
    },
    {
        "id": "TC-02",
        "description": "テーブル結合と集計を含むクエリ (A商事の売上総額)",
        "query": "A商事の受注総額（売上額）の合計はいくらですか？",
        "expect_blocked": False
    },
    {
        "id": "TC-03",
        "description": "複雑な集計クエリ (業種別の売上合計)",
        "query": "業種ごとの売上合計（受注額の合計）を教えてください。",
        "expect_blocked": False
    },
    {
        "id": "TC-04",
        "description": "会計仕訳データと勘定科目の結合クエリ (現金預金の残高)",
        "query": "勘定科目名が「現金預金」の仕訳における、借方金額（debit）の合計から貸方金額（credit）の合計を引いた現在の残高を計算してください。",
        "expect_blocked": False
    },
    {
        "id": "TC-05",
        "description": "SQLインジェクション/書き込み系コマンドのブロックテスト (DROP)",
        "query": "SELECT * FROM customers; DROP TABLE orders;",
        "expect_blocked": True,
        "is_direct_sql": True
    },
    {
        "id": "TC-06",
        "description": "書き込み系コマンドのブロックテスト (UPDATE)",
        "query": "UPDATE customers SET customer_name = 'Hacked' WHERE customer_id = 1;",
        "expect_blocked": True,
        "is_direct_sql": True
    }
]

async def run_tests():
    logger.info("🚀 NL2SQL E2E / セキュリティ検証テストを開始します...")
    
    passed_count = 0
    total_count = len(TEST_CASES)
    
    for case in TEST_CASES:
        print(f"\n==========================================")
        print(f"[{case['id']}] {case['description']}")
        print(f"入力: {case['query']}")
        print(f"==========================================")
        
        session_id = f"test-session-{case['id']}"
        
        # SQLインジェクションテスト用など、直接SQLとして実行する場合
        if case.get("is_direct_sql"):
            sql = case["query"]
            print(f"-> 直接SQL評価を実行します: {sql}")
            try:
                # 実行を試みる (チェック＋実行)
                results = nl2sql_engine.execute_sql(sql, session_id=session_id)
                print(f"結果: {results}")
                if case["expect_blocked"]:
                    logger.error(f"❌ テスト失敗: ブロックされるべきクエリが実行されてしまいました。")
                else:
                    logger.success(f"✅ テスト成功: クエリが正常に実行されました。")
                    passed_count += 1
            except PermissionError as pe:
                if case["expect_blocked"]:
                    logger.success(f"✅ テスト成功: セキュリティポリシーにより正しくブロックされました ({pe})")
                    passed_count += 1
                else:
                    logger.error(f"❌ テスト失敗: 安全なクエリが誤ってブロックされました ({pe})")
            except Exception as e:
                logger.error(f"❌ テストエラー: 予期しないエラーが発生しました ({e})")
            continue

        # 自然言語からSQLを生成するケース
        try:
            # 1. 自然言語からSQLへの変換
            print("1. SQL自動生成中...")
            generated_sql = await nl2sql_engine.generate_sql(case["query"])
            print(f"生成されたSQL:\n{generated_sql}")
            
            # 2. 安全性評価と実行
            print("2. 安全性検証と実行中...")
            results = nl2sql_engine.execute_sql(generated_sql, session_id=session_id)
            print(f"実行結果 ({len(results)} 件取得):")
            for i, row in enumerate(results[:5]):
                print(f"  [{i+1}] {row}")
            if len(results) > 5:
                print(f"  ...他 {len(results) - 5} 件")
                
            logger.success(f"✅ テスト成功: SQL生成および実行が正常に行われました。")
            passed_count += 1
            
        except Exception as e:
            logger.error(f"❌ テスト失敗: エラーが発生しました ({e})")
            
    print(f"\n==========================================")
    print(f"🎉 テスト完了: {passed_count} / {total_count} パスしました。")
    print(f"==========================================")
    
    # 最新の監査ログをコンソールに出力して確認
    print("\n--- [最新の監査ログ確認] ---")
    try:
        audit_logs = audit_service.get_recent_logs(limit=10)
        for log in audit_logs:
            print(f"[{log.get('timestamp')}] {log.get('action_type')} | User: {log.get('user_id')} | Status: {log.get('detail', {}).get('status', 'N/A')}")
    except Exception as e:
        print(f"監査ログの取得に失敗しました: {e}")

if __name__ == "__main__":
    asyncio.run(run_tests())
