import sys
from pathlib import Path
from pypdf import PdfReader

def extract_pdf_info(pdf_path: Path):
    print(f"\n==========================================")
    print(f"=== Reading PDF: {pdf_path.name} ===")
    print(f"==========================================")
    try:
        reader = PdfReader(str(pdf_path))
        print(f"Total pages: {len(reader.pages)}")
        
        # SQLやテーブル定義、スキーマ、DB名に関連するキーワード
        keywords = ["会計", "販売", "スキーマ", "テーブル", "sql", "db", "売上", "利益", "database", "schema", "table"]
        
        for idx, page in enumerate(reader.pages):
            text = page.extract_text()
            if not text:
                continue
            
            # 各ページのテキストをすべて出力する（全ページ分を確認するため）
            print(f"\n--- Page {idx+1} ---")
            print(text)
            
    except Exception as e:
        print(f"Error reading {pdf_path.name}: {e}")

def main():
    # /app の中の全PDF
    root = Path("/app")
    for file in root.glob("*.pdf"):
        extract_pdf_info(file)

if __name__ == "__main__":
    main()
