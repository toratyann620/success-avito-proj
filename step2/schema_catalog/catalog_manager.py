"""
業務定義カタログ管理モジュール
YAMLで定義されたデータベース構造や結合キー、KPIを取得・パースする
"""
import os
import yaml
from pathlib import Path
from loguru import logger

DEFAULT_CATALOG_PATH = os.getenv(
    "CATALOG_PATH", 
    str(Path(__file__).parent / "catalog.yaml")
)

class CatalogManager:
    """業務定義カタログ（catalog.yaml）のパース・管理クラス"""

    def __init__(self, catalog_path: str = DEFAULT_CATALOG_PATH):
        self.catalog_path = catalog_path
        self.catalog = self._load_catalog()

    def _load_catalog(self) -> dict:
        """YAMLカタログファイルを読み込む"""
        try:
            if not Path(self.catalog_path).exists():
                logger.warning(f"カタログファイルが見つかりません: {self.catalog_path}")
                return {}
            
            with open(self.catalog_path, "r", encoding="utf-8") as f:
                data = yaml.safe_load(f)
                logger.info(f"✅ 業務定義カタログをロードしました: {self.catalog_path}")
                return data
        except Exception as e:
            logger.error(f"カタログのロード中にエラーが発生しました: {e}")
            return {}

    def get_table_schema_summary(self) -> str:
        """LLMのプロンプト挿入用にテーブルスキーマのサマリーテキストを作成する"""
        if not self.catalog:
            return "（カタログ情報なし）"

        db_info = self.catalog.get("database", {})
        tables = db_info.get("tables", [])
        
        lines = []
        lines.append(f"【利用可能なテーブル・項目一覧】")
        
        for table in tables:
            lines.append(f"- テーブル名: {table['name']} ({table.get('description', '')})")
            lines.append("  カラム一覧:")
            for col in table.get("columns", []):
                lines.append(f"    * {col['name']} ({col['type']}): {col.get('description', '')}")
            lines.append("")
        
        return "\n".join(lines)

    def get_join_instructions(self) -> str:
        """LLMのプロンプト挿入用にテーブル結合方法（JOIN句）の定義をテキスト化する"""
        if not self.catalog:
            return ""

        db_info = self.catalog.get("database", {})
        joins = db_info.get("joins", [])
        
        if not joins:
            return ""
            
        lines = []
        lines.append("【テーブル結合条件（JOIN）のガイドライン】")
        lines.append("テーブル同士をJOIN（結合）する場合は、必ず以下の条件句を使用してください。")
        for join in joins:
            lines.append(f"- {join['from_table']} と {join['to_table']} を結合する場合: {join['join_clause']}")
            
        return "\n".join(lines)

    def get_kpi_definitions(self) -> str:
        """LLMのプロンプト挿入用に主要KPIの定義をテキスト化する"""
        if not self.catalog:
            return ""

        db_info = self.catalog.get("database", {})
        kpis = db_info.get("kpis", [])
        
        if not kpis:
            return ""
            
        lines = []
        lines.append("【定義済みの主要業務KPI・集計式】")
        lines.append("特定の業務指標を求められた場合は、以下の計算式・SQL構造を参考にしてください。")
        for kpi in kpis:
            lines.append(f"- 指標名: {kpi['name']}")
            lines.append(f"  計算例/SQL: {kpi['calculation']}")
            lines.append(f"  説明: {kpi.get('description', '')}")
            lines.append("")
            
        return "\n".join(lines)

    def get_all_prompt_context(self) -> str:
        """LLMに渡すスキーマ全体のプロンプト用コンテキストを生成する"""
        schema = self.get_table_schema_summary()
        joins = self.get_join_instructions()
        kpis = self.get_kpi_definitions()
        
        return f"{schema}\n---\n{joins}\n---\n{kpis}"


# シングルトンインスタンス
catalog_manager = CatalogManager()

if __name__ == "__main__":
    # 簡易テスト
    manager = CatalogManager()
    print(manager.get_all_prompt_context())
