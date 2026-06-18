"""
データベースパフォーマンス最適化スクリプト
SQLite DBのインデックス追加およびWALモード等の設定を適用します。
"""
import sqlite3
import os
from pathlib import Path
from loguru import logger

# プロジェクトのルートからのパスまたはコンテナ内の共有パスに対応
DB_PATHS = [
    os.getenv("BUSINESS_DB_PATH", "db/sqlite/business.db"),
    "/data/sqlite/business.db"
]

def optimize_db():
    target_path = None
    for path in DB_PATHS:
        if Path(path).exists():
            target_path = path
            break
            
    if not target_path:
        # 存在しない場合は新規作成するかデフォルトパスを使用
        target_path = DB_PATHS[0]
        db_dir = Path(target_path).parent
        db_dir.mkdir(parents=True, exist_ok=True)

    logger.info(f"データベースの最適化を開始します: {target_path}")
    
    try:
        # SQLite接続（WALモード適用のため、読み書き可能で接続）
        conn = sqlite3.connect(target_path)
        cursor = conn.cursor()
        
        # 1. パフォーマンス向上のためのPRAGMA設定 (WALモード)
        logger.info("PRAGMAパラメータ設定 (WALモード / 同期設定緩和) を適用します。")
        cursor.execute("PRAGMA journal_mode = WAL;")
        journal_mode = cursor.fetchone()[0]
        logger.info(f"現在のジャーナルモード: {journal_mode}")
        
        cursor.execute("PRAGMA synchronous = NORMAL;")
        cursor.execute("PRAGMA cache_size = -2000;")  # 約2MBのキャッシュ
        
        # 2. クエリ高速化のためのインデックス作成 (販売関連)
        logger.info("インデックスを作成します（販売関連）...")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON orders(customer_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);")
        
        # 3. クエリ高速化のためのインデックス作成 (会計関連)
        logger.info("インデックスを作成します（会計関連）...")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_journals_entry_date ON journals(entry_date);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_journal_lines_journal_id ON journal_lines(journal_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_journal_lines_account_code ON journal_lines(account_code);")
        
        conn.commit()
        logger.success("インデックスの作成とデータベース最適化が完了しました。")
        
    except Exception as e:
        logger.error(f"データベースの最適化処理中にエラーが発生しました: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    optimize_db()
