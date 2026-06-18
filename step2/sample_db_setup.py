"""
検証用の模擬会計・販売データベース（SQLite）を作成するセットアップスクリプト
"""
import sqlite3
import os
from pathlib import Path
from datetime import datetime, timedelta
import random

DB_PATH = os.getenv("BUSINESS_DB_PATH", "db/sqlite/business.db")

def setup_db():
    print(f"Creating business database at: {DB_PATH}")
    db_dir = Path(DB_PATH).parent
    db_dir.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # ==========================================
    # 1. テーブル作成（販売）
    # ==========================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS customers (
            customer_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            customer_name  TEXT NOT NULL,
            industry       TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS products (
            product_id    INTEGER PRIMARY KEY AUTOINCREMENT,
            product_name  TEXT NOT NULL,
            category      TEXT NOT NULL,
            price         INTEGER NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS orders (
            order_id      INTEGER PRIMARY KEY AUTOINCREMENT,
            order_date    DATE NOT NULL,
            customer_id   INTEGER NOT NULL,
            total_amount  INTEGER DEFAULT 0,
            FOREIGN KEY(customer_id) REFERENCES customers(customer_id)
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS order_items (
            item_id     INTEGER PRIMARY KEY AUTOINCREMENT,
            order_id    INTEGER NOT NULL,
            product_id  INTEGER NOT NULL,
            quantity    INTEGER NOT NULL,
            subtotal    INTEGER NOT NULL,
            FOREIGN KEY(order_id) REFERENCES orders(order_id),
            FOREIGN KEY(product_id) REFERENCES products(product_id)
        )
    """)

    # ==========================================
    # 2. テーブル作成（会計）
    # ==========================================
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            account_code  TEXT PRIMARY KEY,
            account_name  TEXT NOT NULL,
            account_type  TEXT NOT NULL CHECK(account_type IN ('Asset', 'Liability', 'Equity', 'Revenue', 'Expense'))
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS journals (
            journal_id   INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_date   DATE NOT NULL,
            description  TEXT NOT NULL
        )
    """)

    cursor.execute("""
        CREATE TABLE IF NOT EXISTS journal_lines (
            line_id       INTEGER PRIMARY KEY AUTOINCREMENT,
            journal_id    INTEGER NOT NULL,
            account_code  TEXT NOT NULL,
            debit         INTEGER DEFAULT 0,
            credit        INTEGER DEFAULT 0,
            FOREIGN KEY(journal_id) REFERENCES journals(journal_id),
            FOREIGN KEY(account_code) REFERENCES accounts(account_code)
        )
    """)

    # ==========================================
    # 3. サンプルデータ挿入
    # ==========================================
    
    # 顧客データ
    customers = [
        ("A商事", "商社"),
        ("B工業", "製造業"),
        ("Cフーズ", "食品"),
        ("Dシステム", "IT・サービス"),
        ("E不動産", "不動産")
    ]
    cursor.executemany("INSERT OR IGNORE INTO customers (customer_name, industry) VALUES (?, ?)", customers)

    # 商品データ
    products = [
        ("クラウド基盤導入パック", "システム構築", 1200000),
        ("セキュリティライセンス", "ソフトウェア", 50000),
        ("システム保守・運用サポート", "保守サービス", 100000),
        ("AI駆動文書作成ウィジェット", "ソフトウェア", 300000),
        ("ITコンサルティング（人月）", "コンサルティング", 1500000)
    ]
    cursor.executemany("INSERT OR IGNORE INTO products (product_name, category, price) VALUES (?, ?, ?)", products)

    # 勘定科目データ
    accounts = [
        ("111", "現金預金", "Asset"),
        ("112", "売掛金", "Asset"),
        ("113", "備品", "Asset"),
        ("211", "買掛金", "Liability"),
        ("311", "資本金", "Equity"),
        ("411", "売上高", "Revenue"),
        ("511", "仕入高", "Expense"),
        ("512", "給与手当", "Expense"),
        ("513", "地代家賃", "Expense"),
        ("514", "通信費", "Expense")
    ]
    cursor.executemany("INSERT OR IGNORE INTO accounts (account_code, account_name, account_type) VALUES (?, ?, ?)", accounts)

    conn.commit()

    # ==========================================
    # 4. 取引・仕訳データの自動生成（過去180日分）
    # ==========================================
    # 既存データを確認し、なければ追加
    cursor.execute("SELECT count(*) FROM orders")
    if cursor.fetchone()[0] == 0:
        print("Generating transactions...")
        start_date = datetime.now() - timedelta(days=180)
        
        # 初期資本金の仕訳
        cursor.execute("INSERT INTO journals (entry_date, description) VALUES (?, ?)", (start_date.date(), "設立・資本金入金"))
        jid = cursor.lastrowid
        cursor.execute("INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?, ?, ?, ?)", (jid, "111", 10000000, 0)) # 現金 1000万
        cursor.execute("INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?, ?, ?, ?)", (jid, "311", 0, 10000000)) # 資本金 1000万

        # 毎月の固定費仕訳 (給与・家賃)
        for m in range(6):
            fixed_date = (start_date + timedelta(days=m*30)).date()
            # 家賃
            cursor.execute("INSERT INTO journals (entry_date, description) VALUES (?, ?)", (fixed_date, f"{fixed_date.month}月度 事務所家賃支払"))
            jid = cursor.lastrowid
            cursor.execute("INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?, ?, ?, ?)", (jid, "513", 250000, 0)) # 地代家賃
            cursor.execute("INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?, ?, ?, ?)", (jid, "111", 0, 250000)) # 現金
            
            # 給与
            cursor.execute("INSERT INTO journals (entry_date, description) VALUES (?, ?)", (fixed_date, f"{fixed_date.month}月度 従業員給与支給"))
            jid = cursor.lastrowid
            cursor.execute("INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?, ?, ?, ?)", (jid, "512", 800000, 0)) # 給与
            cursor.execute("INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?, ?, ?, ?)", (jid, "111", 0, 800000)) # 現金

        # ランダムな売上・仕入取引
        for i in range(40):
            order_date = (start_date + timedelta(days=random.randint(1, 179))).date()
            cust_id = random.randint(1, 5)
            
            # 受注ヘッダー挿入
            cursor.execute("INSERT INTO orders (order_date, customer_id) VALUES (?, ?)", (order_date, cust_id))
            order_id = cursor.lastrowid
            
            # 受注明細挿入（1〜3個の商品）
            total_amount = 0
            selected_products = random.sample(range(1, 6), random.randint(1, 3))
            
            for prod_id in selected_products:
                cursor.execute("SELECT price FROM products WHERE product_id = ?", (prod_id,))
                price = cursor.fetchone()[0]
                qty = random.randint(1, 5) if prod_id != 1 and prod_id != 5 else 1 # 高額商品は1個のみ
                subtotal = price * qty
                
                cursor.execute("""
                    INSERT INTO order_items (order_id, product_id, quantity, subtotal)
                    VALUES (?, ?, ?, ?)
                """, (order_id, prod_id, qty, subtotal))
                total_amount += subtotal
                
            # ヘッダーの合計金額を更新
            cursor.execute("UPDATE orders SET total_amount = ? WHERE order_id = ?", (total_amount, order_id))
            
            # 売上の会計仕訳（掛売上とする）
            cursor.execute("INSERT INTO journals (entry_date, description) VALUES (?, ?)", (order_date, f"売上計上 (受注No.{order_id})"))
            jid = cursor.lastrowid
            cursor.execute("INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?, ?, ?, ?)", (jid, "112", total_amount, 0)) # 売掛金
            cursor.execute("INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?, ?, ?, ?)", (jid, "411", 0, total_amount)) # 売上高
            
            # 50%の確率で、30日以内に入金される仕訳を追加（売掛金の回収）
            if random.random() > 0.5:
                pay_date = order_date + timedelta(days=random.randint(5, 30))
                if pay_date < datetime.now().date():
                    cursor.execute("INSERT INTO journals (entry_date, description) VALUES (?, ?)", (pay_date, f"売掛金入金確認 (受注No.{order_id})"))
                    jid_pay = cursor.lastrowid
                    cursor.execute("INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?, ?, ?, ?)", (jid_pay, "111", total_amount, 0)) # 現金
                    cursor.execute("INSERT INTO journal_lines (journal_id, account_code, debit, credit) VALUES (?, ?, ?, ?)", (jid_pay, "112", 0, total_amount)) # 売掛金

        conn.commit()
        print("Transactions generated successfully.")

    conn.close()
    print("Database setup complete.")

if __name__ == "__main__":
    setup_db()
