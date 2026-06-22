import os
import sqlite3
import unicodedata
from pathlib import Path
from dataclasses import dataclass
from loguru import logger

import chromadb
from llama_index.embeddings.huggingface import HuggingFaceEmbedding
from llama_index.vector_stores.chroma import ChromaVectorStore
from llama_index.core import StorageContext, VectorStoreIndex, Document
from llama_index.core.node_parser import SentenceSplitter
from llama_index.core.vector_stores import MetadataFilters, MetadataFilter, FilterOperator

DB_PATH = os.getenv("SQLITE_DB_PATH", "/data/sqlite/knowledge.db")
VECTOR_STORE_PATH = os.getenv("VECTOR_STORE_PATH", "/data/vector_store")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "intfloat/multilingual-e5-small")


@dataclass
class SearchResult:
    """検索結果（rag_engine.py の SearchResult と同一の構造）"""
    file_path: str
    file_name: str
    content: str
    score: float
    snippet: str


class VectorEngine:
    """LlamaIndex + ChromaDB + multilingual-e5-small によるベクトル検索エンジン"""

    def __init__(self):
        self.db_path = DB_PATH
        self.vector_store_path = VECTOR_STORE_PATH
        self.model_name = EMBEDDING_MODEL
        self.index = None  # 初期化失敗時はNoneのままとし、各メソッドで安全に縮退動作させる

        logger.info(f"VectorEngine 初期化開始: model={self.model_name}, store={self.vector_store_path}")

        try:
            # 1. Embeddingモデルのロード (ローカル動作)
            self.embed_model = HuggingFaceEmbedding(
                model_name=self.model_name,
                query_instruction="query: ",
                text_instruction="passage: ",
                device="cpu"
            )

            # 2. ChromaDBクライアントの作成
            # 保存先ディレクトリが存在することを確認
            Path(self.vector_store_path).mkdir(parents=True, exist_ok=True)
            self.chroma_client = chromadb.PersistentClient(path=self.vector_store_path)
            self.chroma_collection = self.chroma_client.get_or_create_collection("avito_collection")

            # 3. LlamaIndexのChromaVectorStoreとStorageContextの初期化
            self.vector_store = ChromaVectorStore(chroma_collection=self.chroma_collection)
            self.storage_context = StorageContext.from_defaults(vector_store=self.vector_store)

            # 4. インデックスオブジェクトのロード
            self.index = VectorStoreIndex.from_vector_store(
                self.vector_store,
                embed_model=self.embed_model
            )
            logger.info("VectorEngine 初期化完了")
        except Exception:
            # ここで例外を再raiseすると、rag_engine.py がモジュールimport時点で
            # vector_engine をimportしているため、API全体が起動不能になる
            # （RAG_BACKEND=fts5 のフォールバックすら使えなくなる）。
            # 初期化失敗時は self.index=None のまま握り、各メソッド側で安全に縮退させる。
            logger.opt(exception=True).error(
                "VectorEngine 初期化失敗。ベクトル検索は利用不可になりますが、"
                "FTS5フォールバック(RAG_BACKEND=fts5)やAPI全体の起動には影響しません。"
            )

    def index_document(self, file_path: str, file_name: str, content: str):
        """ドキュメントをチャンク分割・ベクトル化してChromaに保存する

        失敗してもFTS5側の登録（呼び出し元 sources.py）には一切影響しない。
        """
        if self.index is None:
            logger.warning(f"VectorEngine未初期化のためベクトルインデックス登録をスキップします: {file_name}")
            return

        if not content.strip():
            logger.warning(f"空のテキストのためベクトルインデックス登録をスキップします: {file_name}")
            return

        doc_id = unicodedata.normalize("NFKC", str(file_path))
        logger.info(f"ドキュメントのベクトル化を開始: {file_name} (doc_id={doc_id})")

        try:
            # 重複を避けるため、既存の同じ doc_id のノードを削除
            self.remove_document(file_path)

            # チャンク分割設定 (chunk_size=512, chunk_overlap=50)
            splitter = SentenceSplitter(chunk_size=512, chunk_overlap=50)

            # ドキュメントオブジェクトの構築
            doc = Document(
                id_=doc_id,
                text=content,
                metadata={
                    "doc_id": doc_id,
                    "file_name": file_name,
                    "file_path": str(file_path)
                },
                excluded_embed_metadata_keys=["doc_id", "file_name", "file_path"],
                excluded_llm_metadata_keys=["doc_id", "file_name", "file_path"]
            )

            # チャンク分割とメタデータ付与
            nodes = splitter.get_nodes_from_documents([doc])
            for node in nodes:
                node.metadata["doc_id"] = doc_id
                node.metadata["file_name"] = file_name
                node.metadata["file_path"] = str(file_path)

            # インデックスへ追加
            self.index.insert_nodes(nodes)
            logger.info(f"ドキュメントのベクトル化と保存が完了: {file_name} ({len(nodes)} チャンク)")
        except Exception:
            logger.opt(exception=True).warning(f"ドキュメントのベクトル化中にエラーが発生しました [{file_name}]")

    def remove_document(self, file_path: str):
        """指定されたドキュメントのベクトルをChromaから削除する"""
        if self.index is None:
            return

        doc_id = unicodedata.normalize("NFKC", str(file_path))
        try:
            self.chroma_collection.delete(where={"doc_id": doc_id})
            logger.info(f"Chromaからベクトルデータを削除しました: {doc_id}")
        except Exception:
            logger.opt(exception=True).warning(f"Chromaからのベクトルデータ削除中にエラーが発生しました [{doc_id}]")

    def _get_doc_ids_from_source_ids(self, source_ids: list[int]) -> list[str]:
        """SQLiteのsourcesテーブルから指定されたIDに対応するfile_path（NFKC正規化済み）を取得する"""
        if not source_ids:
            return []
        conn = sqlite3.connect(self.db_path)
        try:
            cursor = conn.cursor()
            placeholders = ",".join("?" * len(source_ids))
            cursor.execute(
                f"SELECT file_path FROM sources WHERE id IN ({placeholders})",
                [int(sid) for sid in source_ids]
            )
            rows = cursor.fetchall()
            return [unicodedata.normalize("NFKC", row[0]) for row in rows]
        except Exception:
            logger.opt(exception=True).warning("SQLiteからのソースパス取得エラー")
            return []
        finally:
            conn.close()

    def search(self, query: str, top_k: int = 5, source_ids: list[int] = None) -> list[SearchResult]:
        """クエリからベクトル検索を実行する（未初期化時・0件時は例外を出さず空リストを返す）"""
        logger.info(f"ベクトル検索実行: query='{query[:50]}...', top_k={top_k}, source_ids={source_ids}")

        if self.index is None:
            logger.warning("VectorEngine未初期化のためベクトル検索をスキップします（空の結果を返します）")
            return []

        filters = None
        if source_ids:
            doc_ids = self._get_doc_ids_from_source_ids(source_ids)
            if not doc_ids:
                logger.info("指定されたsource_idsに該当するドキュメントパスが見つかりません。空の結果を返します。")
                return []

            if len(doc_ids) == 1:
                filters = MetadataFilters(
                    filters=[MetadataFilter(key="doc_id", value=doc_ids[0])]
                )
            else:
                filters = MetadataFilters(
                    filters=[
                        MetadataFilter(
                            key="doc_id",
                            value=doc_ids,
                            operator=FilterOperator.IN
                        )
                    ]
                )
            logger.info(f"検索対象を限定 (doc_ids={doc_ids})")

        try:
            retriever = self.index.as_retriever(
                similarity_top_k=top_k,
                filters=filters
            )
            nodes = retriever.retrieve(query)

            results = []
            for node in nodes:
                text = node.node.text
                meta = node.node.metadata
                score = node.score if node.score is not None else 0.0

                # 検索キーワードの周辺スニペットを簡易的に作成
                snippet = text[:150] + "..." if len(text) > 150 else text

                results.append(SearchResult(
                    file_path=meta.get("file_path", ""),
                    file_name=meta.get("file_name", ""),
                    content=text,
                    score=score,
                    snippet=snippet
                ))
            logger.info(f"ベクトル検索結果: {len(results)}件ヒット")
            return results
        except Exception:
            logger.opt(exception=True).warning("ベクトル検索中にエラーが発生しました（空の結果を返します）")
            return []


# シングルトンインスタンス
vector_engine = VectorEngine()
