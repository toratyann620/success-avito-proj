"""
RAGエンジン
ドキュメント検索 → コンテキスト生成 → LLM回答生成のパイプライン
"""
import sqlite3
import json
import os
from pathlib import Path
from dataclasses import dataclass
from loguru import logger

from services.llm_client import llm_client, RAG_SYSTEM_PROMPT, DOCUMENT_GENERATION_PROMPT

DB_PATH = os.getenv("SQLITE_DB_PATH", "/data/sqlite/knowledge.db")


@dataclass
class SearchResult:
    """検索結果"""
    file_path: str
    file_name: str
    content: str
    score: float
    snippet: str


@dataclass
class RAGResponse:
    """RAG回答"""
    answer: str
    citations: list[dict]
    query: str


def clean_fts_query(query: str) -> str:
    """FTS5用の検索クエリをクレンジングする（記号の除去など）"""
    import re
    # ドットや記号などFTS5でシンタックスエラーになりやすい文字を除去・スペースに置換
    cleaned = re.sub(r'[^\w\s\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FAF]', ' ', query)
    # 単語に分割
    words = [w.strip() for w in cleaned.split() if w.strip()]
    if not words:
        return ""
    # 単語を OR で結合して検索のヒット率を高める
    return " OR ".join(words[:5])


class RAGEngine:
    """SQLite FTS5 + LLMによるRAGエンジン"""

    def __init__(self):
        self.db_path = DB_PATH
        self.max_context_chars = 4000  # コンテキスト最大文字数
        self.top_k = 5  # 検索結果の上位件数

    def search_fts(self, query: str, top_k: int = None, source_ids: list[str] = None) -> list[SearchResult]:
        """FTS5全文検索でドキュメントを検索する

        source_ids が指定された場合（手動参照モード）、sources テーブルで
        選択されたソースの file_path に一致する documents_fts.doc_id のみを検索対象にする。
        """
        query = clean_fts_query(query)
        if not query:
            return []

        k = top_k or self.top_k
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            cursor = conn.cursor()
            # FTS5のMATCHクエリで全文検索
            if source_ids:
                placeholders = ",".join("?" * len(source_ids))
                logger.info(f"手動参照モード: {len(source_ids)}件のソースに限定して検索 (ids={source_ids})")
                cursor.execute(f"""
                    SELECT
                        doc_id,
                        file_path,
                        file_name,
                        snippet(documents_fts, 3, '<b>', '</b>', '...', 32) AS snippet,
                        rank
                    FROM documents_fts
                    WHERE documents_fts MATCH ?
                      AND doc_id IN (SELECT file_path FROM sources WHERE id IN ({placeholders}))
                    ORDER BY rank
                    LIMIT ?
                """, (query, *[int(sid) for sid in source_ids], k))
            else:
                cursor.execute("""
                    SELECT
                        doc_id,
                        file_path,
                        file_name,
                        snippet(documents_fts, 3, '<b>', '</b>', '...', 32) AS snippet,
                        rank
                    FROM documents_fts
                    WHERE documents_fts MATCH ?
                    ORDER BY rank
                    LIMIT ?
                """, (query, k))
            rows = cursor.fetchall()
            results = []
            for row in rows:
                # 全文を取得
                cursor.execute("""
                    SELECT content FROM documents_fts WHERE doc_id = ?
                """, (row["doc_id"],))
                content_row = cursor.fetchone()
                content = content_row["content"] if content_row else ""
                results.append(SearchResult(
                    file_path=row["file_path"],
                    file_name=row["file_name"],
                    content=content[:2000],  # 長すぎる場合は先頭2000文字
                    score=abs(row["rank"]),
                    snippet=row["snippet"],
                ))
            return results
        except sqlite3.OperationalError as e:
            logger.warning(f"FTS5検索エラー（テーブル未作成の可能性）: {e}")
            return []
        finally:
            conn.close()

    def build_context(self, results: list[SearchResult]) -> tuple[str, list[dict]]:
        """検索結果からLLMへ渡すコンテキストを構築する"""
        context_parts = []
        sources = []
        total_chars = 0

        for i, result in enumerate(results):
            chunk = f"【資料{i+1}: {result.file_name}】\n{result.content}\n"
            if total_chars + len(chunk) > self.max_context_chars:
                break
            context_parts.append(chunk)
            total_chars += len(chunk)
            sources.append({
                "index": i + 1,
                "file_name": result.file_name,
                "file_path": result.file_path,
                "snippet": result.snippet,
                "score": result.score,
            })

        return "\n---\n".join(context_parts), sources

    async def query(self, user_query: str, session_id: str = None, source_ids: list[str] = None) -> RAGResponse:
        """ユーザーの質問に対してRAG回答を生成する"""
        logger.info(f"RAGクエリ: {user_query[:50]}...")

        # 1. 全文検索（source_ids指定時は選択ソースのみに限定）
        results = self.search_fts(user_query, source_ids=source_ids)
        logger.info(f"検索結果: {len(results)}件")

        if not results:
            # 検索結果がない場合はLLMのみで回答
            answer = await llm_client.chat([
                {"role": "system", "content": "あなたは社内AIアシスタントです。参照資料がありません。その旨を伝えたうえで、一般的な観点から簡潔に回答してください。"},
                {"role": "user", "content": user_query},
            ])
            return RAGResponse(answer=answer, citations=[], query=user_query)

        # 2. コンテキスト構築
        context, citations = self.build_context(results)

        # 3. LLMで回答生成
        system_prompt = RAG_SYSTEM_PROMPT.format(context=context)
        answer = await llm_client.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query},
        ])

        return RAGResponse(answer=answer, citations=citations, query=user_query)

    async def generate_document_draft(
        self,
        requirements: str,
        doc_type: str,
        query: str,
    ) -> RAGResponse:
        """文書ドラフトをRAGを使って生成する"""
        logger.info(f"文書生成: {doc_type}")

        # 関連資料を検索
        results = self.search_fts(query)
        context, citations = self.build_context(results)

        # 文書生成プロンプト
        prompt = DOCUMENT_GENERATION_PROMPT.format(
            doc_type=doc_type,
            requirements=requirements,
            context=context if context else "（参照資料なし）",
        )
        answer = await llm_client.generate(prompt)
        return RAGResponse(answer=answer, citations=citations, query=query)


# シングルトンインスタンス
rag_engine = RAGEngine()
