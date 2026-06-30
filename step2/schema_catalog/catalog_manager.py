"""
業務定義カタログ管理モジュール
YAMLで定義されたデータベース構造や結合キー、KPIを取得・パースする
"""
import os
import re
import yaml
from pathlib import Path
from loguru import logger

# 質問文とのキーワード一致判定で対象外とする、意味を持たない短い断片
_STOPWORDS = {"を", "は", "が", "の", "に", "へ", "と", "で", "から", "まで", "や"}

MAX_RELEVANT_CONTEXT_CHARS = 2000

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

    @staticmethod
    def _extract_search_terms(text: str) -> set[str]:
        """日本語の説明文から、質問文との部分一致判定に使う検索語を抽出する。

        分かち書き（形態素解析）を行わずに日本語の部分一致を実現するため、
        句読点・括弧で区切った断片に加え、2文字bi-gramも生成する。
        """
        if not text:
            return set()
        parts = re.split(r"[、。（）・/,\s]+", text)
        terms: set[str] = set()
        for part in parts:
            part = part.strip()
            if len(part) < 2:
                continue
            terms.add(part)
            for i in range(len(part) - 1):
                bigram = part[i:i + 2]
                if bigram not in _STOPWORDS:
                    terms.add(bigram)
        return terms

    def _find_relevant_table_names(self, user_query: str) -> set[str]:
        """質問文に部分一致するテーブル（テーブル名・説明文・カラム名/説明）を判定する"""
        db_info = self.catalog.get("database", {})
        tables = db_info.get("tables", [])

        matched = set()
        for table in tables:
            terms = {table["name"]}
            terms |= self._extract_search_terms(table.get("description", ""))
            for col in table.get("columns", []):
                terms.add(col["name"])
                terms |= self._extract_search_terms(col.get("description", ""))

            if any(term and term in user_query for term in terms):
                matched.add(table["name"])

        return matched

    def get_relevant_prompt_context(self, user_query: str) -> str:
        """
        ユーザーの質問文に含まれるキーワードから関連テーブルのみを抽出し、
        該当テーブルのスキーマ・JOIN情報・KPI定義のみをプロンプト用に返す。
        全件マッチしない場合は主要テーブル（orders, customers, products）
        に絞ったミニマム版を返す。

        catalog.yaml全体（数千文字）を毎回プロンプトに埋め込むと、軽量モデルでも
        処理が遅延・タイムアウトする原因になるため、必要最小限のコンテキストのみを渡す。
        """
        if not self.catalog:
            return "（カタログ情報なし）"

        db_info = self.catalog.get("database", {})
        tables = db_info.get("tables", [])
        joins = db_info.get("joins", [])
        kpis = db_info.get("kpis", [])

        matched_names = self._find_relevant_table_names(user_query)
        if not matched_names:
            matched_names = {"orders", "customers", "products"}
            logger.info("カタログキーワードが質問文と一致しなかったため、主要テーブル（orders/customers/products）のミニマム版を使用します。")

        matched_tables = [t for t in tables if t["name"] in matched_names]

        # スキーマ
        schema_lines = ["【利用可能なテーブル・項目一覧】"]
        for table in matched_tables:
            schema_lines.append(f"- テーブル名: {table['name']} ({table.get('description', '')})")
            schema_lines.append("  カラム一覧:")
            for col in table.get("columns", []):
                schema_lines.append(f"    * {col['name']} ({col['type']}): {col.get('description', '')}")
            schema_lines.append("")
        schema_text = "\n".join(schema_lines)

        # JOIN（関連テーブル同士のものだけ）
        relevant_joins = [
            j for j in joins
            if j["from_table"] in matched_names and j["to_table"] in matched_names
        ]
        join_text = ""
        if relevant_joins:
            join_lines = ["【テーブル結合条件（JOIN）のガイドライン】"]
            for j in relevant_joins:
                join_lines.append(f"- {j['from_table']} と {j['to_table']} を結合する場合: {j['join_clause']}")
            join_text = "\n".join(join_lines)

        # KPI（計算式に関連テーブル名が含まれるものだけ）
        relevant_kpis = [
            k for k in kpis
            if any(name in k.get("calculation", "") for name in matched_names)
        ]
        kpi_text = ""
        if relevant_kpis:
            kpi_lines = ["【定義済みの主要業務KPI・集計式】"]
            for k in relevant_kpis:
                kpi_lines.append(f"- 指標名: {k['name']}")
                kpi_lines.append(f"  計算例/SQL: {k['calculation']}")
                kpi_lines.append(f"  説明: {k.get('description', '')}")
                kpi_lines.append("")
            kpi_text = "\n".join(kpi_lines)

        context = f"{schema_text}\n---\n{join_text}\n---\n{kpi_text}"

        if len(context) > MAX_RELEVANT_CONTEXT_CHARS:
            truncated = context[:MAX_RELEVANT_CONTEXT_CHARS]
            last_newline = truncated.rfind("\n")
            if last_newline > 0:
                truncated = truncated[:last_newline]
            logger.warning(
                f"カタログコンテキストが{MAX_RELEVANT_CONTEXT_CHARS}文字を超えたため切り詰めました"
                f"（元: {len(context)}文字 → {len(truncated)}文字）"
            )
            context = truncated

        return context


# シングルトンインスタンス
catalog_manager = CatalogManager()

if __name__ == "__main__":
    # 簡易テスト
    manager = CatalogManager()
    print(manager.get_all_prompt_context())
