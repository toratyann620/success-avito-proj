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
    sources: list[dict]
    query: str


class RAGEngine:
    """SQLite FTS5 + LLMによるRAGエンジン"""

    def __init__(self):
        self.db_path = DB_PATH
        self.max_context_chars = 4000  # コンテキスト最大文字数
        self.top_k = 5  # 検索結果の上位件数

    def search_fts(self, query: str, top_k: int = None) -> list[SearchResult]:
        """FTS5全文検索でドキュメントを検索する"""
        k = top_k or self.top_k
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            cursor = conn.cursor()
            # FTS5のMATCHクエリで全文検索
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

    async def query(self, user_query: str, session_id: str = None) -> RAGResponse:
        """ユーザーの質問に対してRAG回答を生成する"""
        logger.info(f"RAGクエリ: {user_query[:50]}...")

        # 1. 全文検索
        results = self.search_fts(user_query)
        logger.info(f"検索結果: {len(results)}件")

        if not results:
            # 検索結果がない場合はLLMのみで回答
            answer = await llm_client.chat([
                {"role": "system", "content": "あなたは社内AIアシスタントです。参照資料がありません。その旨を伝えたうえで、一般的な観点から簡潔に回答してください。"},
                {"role": "user", "content": user_query},
            ])
            return RAGResponse(answer=answer, sources=[], query=user_query)

        # 2. コンテキスト構築
        context, sources = self.build_context(results)

        # 3. LLMで回答生成
        system_prompt = RAG_SYSTEM_PROMPT.format(context=context)
        answer = await llm_client.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query},
        ])

        return RAGResponse(answer=answer, sources=sources, query=user_query)

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
        context, sources = self.build_context(results)

        # 文書生成プロンプト
        prompt = DOCUMENT_GENERATION_PROMPT.format(
            doc_type=doc_type,
            requirements=requirements,
            context=context if context else "（参照資料なし）",
        )
        answer = await llm_client.generate(prompt)
        return RAGResponse(answer=answer, sources=sources, query=query)


# シングルトンインスタンス
rag_engine = RAGEngine()
