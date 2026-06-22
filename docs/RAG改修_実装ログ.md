# RAG改修 実装ログ（Antigravity記録）

このログは、要件定義書に定められたステップごとの実装内容と確認結果を記録するものです。

## [2026-06-22 19:32] ステップ1: 依存ライブラリの追加
### 変更ファイル
- [app/api/requirements.txt](file:///Users/kurokawamutsuo/開発フォルダ/051_AI文書検索作成Proj/app/api/requirements.txt)（変更）
### 変更内容
- コメントアウトされていた `llama-index` 関連の記述を削除し、指定されたパッケージとバージョンを固定して追加しました。
  - `llama-index-core==0.11.23`
  - `llama-index-embeddings-huggingface==0.3.1`
  - `llama-index-vector-stores-chroma==0.2.1`
  - `chromadb==0.5.15`
  - `sentence-transformers==3.0.1`
### 判断・選択
- 要件定義書の「3.1 依存ライブラリの追加」に対応。
### 確認結果
- requirements.txt の書換え完了。
### 禁止事項チェック
- 「0.1 禁止事項」に該当する変更はありません。

## [2026-06-22 19:33] ステップ2: vector_engine.py の新規作成
### 変更ファイル
- [app/api/services/vector_engine.py](file:///Users/kurokawamutsuo/開発フォルダ/051_AI文書検索作成Proj/app/api/services/vector_engine.py)（新規）
### 変更内容
- ベクトル検索エンジンである `VectorEngine` クラスを実装しました。
- LlamaIndex の `HuggingFaceEmbedding` を使用して `intfloat/multilingual-e5-small` モデルを CPU でロードする設定としました。
- ChromaDBクライアントを `VECTOR_STORE_PATH` に永続化し、`LlamaIndex` の `ChromaVectorStore` を構成しました。
- ドキュメント登録 `index_document` では、`SentenceSplitter`（chunk_size=512, chunk_overlap=50）でチャンク分割を行い、既存の `doc_id` に属する以前のベクトルを削除した上で新規登録する重複排除ロジックを入れました。
- 検索 `search` では、メタデータフィルタ `doc_id` に対応し、`source_ids` を SQLite の `sources` テーブルから引いた上でNFKC正規化したパスと一致するドキュメントのみを対象とするフィルタを構成しました。複数指定の場合は `FilterOperator.IN` を、単一指定の場合は完全一致フィルタを利用します。
- `SearchResult` は既存の `rag_engine.py` と同じ dataclass 構造を定義して返すようにし、他のコードと疎結合で動作可能にしました。
### 判断・選択
- 要件定義書の「3.2 新規ファイル: app/api/services/vector_engine.py」に対応。
- `doc_id` は `unicodedata.normalize("NFKC", str(file_path))` で正規化して、NFD問題対策を踏襲。
### 確認結果
- vector_engine.py の作成完了。
### 禁止事項チェック
- 新規追加ファイルであり、既存機能への影響はありません。

## [2026-06-22 19:35] ステップ3: rag_engine.py の修正
### 変更ファイル
- [app/api/services/rag_engine.py](file:///Users/kurokawamutsuo/開発フォルダ/051_AI文書検索作成Proj/app/api/services/rag_engine.py)（変更）
### 変更内容
- モジュール先頭で `from services.vector_engine import vector_engine` をインポートするように追記しました。
- `search_fts` メソッドに環境変数 `RAG_BACKEND` を確認する分岐を追加しました。
  - `RAG_BACKEND="vector"`（デフォルト）の場合：
    - `vector_engine.search` を呼び出します。
    - 取得した検索結果を `rag_engine.py` 側で定義された `SearchResult` クラスにマッピングし直して返します。
  - `RAG_BACKEND="fts5"` の場合：
    - 従来通りの SQLite FTS5 全文検索ロジックを実行し、フォールバックとして機能させます。
### 判断・選択
- 要件定義書の「3.3 改修ファイル: app/api/services/rag_engine.py」に対応。
- `search_fts` の名前やシグネチャをそのまま維持し、呼び出し元の `chat.py` 等に変更が及ばないようにしました。
### 確認結果
- rag_engine.py の修正完了。
### 禁止事項チェック
- 「0.1 禁止事項」に該当する変更はありません。

## [2026-06-22 19:37] ステップ4: sources.py の修正
### 変更ファイル
- [app/api/routers/sources.py](file:///Users/kurokawamutsuo/開発フォルダ/051_AI文書検索作成Proj/app/api/routers/sources.py)（変更）
### 変更内容
- `_index_for_rag` 関数の末尾に `vector_engine.index_document` を呼び出す処理を try-except ブロックで囲って追記しました。これにより、ファイル追加・メモ追加等の処理において、既存の FTS5 インデックス作成処理に影響を与えずに、並行してベクトルインデックス登録が連動するようになります。
- `_unindex` 関数の末尾に `vector_engine.remove_document` を呼び出す処理を try-except ブロックで囲って追記しました。これにより、ファイル削除等の処理でベクトルインデックスも連動して削除されます。
### 判断・選択
- 要件定義書の「3.4 インデックス登録の連動（app/api/routers/sources.py）」に対応。
- `sources.py` は原則変更禁止であるため、上記2箇所の関数末尾への最小限の追記（各行の try-except 囲い）のみに留め、既存のテキスト抽出処理や NFKC正規化ロジック等には一切触れていません。
### 確認結果
- sources.py の修正完了。
### 禁止事項チェック
- 「0.1 禁止事項」に定められた「`sources.py` の `_extract_text` や正規化処理の破壊」を行っておらず、安全に追記のみを行いました。

## [2026-06-22 19:40] ステップ5: reindex_vectors.py の新規作成
### 変更ファイル
- [app/api/reindex_vectors.py](file:///Users/kurokawamutsuo/開発フォルダ/051_AI文書検索作成Proj/app/api/reindex_vectors.py)（新規）
### 変更内容
- 既存の FTS5 全文検索データベース (`documents_fts` テーブル) から全文書の `doc_id`, `file_name`, `content` をロードし、`vector_engine.index_document` に順次流し込むことで、既存のナレッジをベクトルストア（Chroma）に同期登録するバッチスクリプト `reindex_vectors.py` を作成しました。
### 判断・選択
- 要件定義書の「3.6 既存文書の再インデックス用スクリプト: app/api/reindex_vectors.py」に対応。
- 進捗が視覚的にわかりやすいよう、件数表示や進捗ログの出力を充実させました。
### 確認結果
- reindex_vectors.py の作成完了。
### 禁止事項チェック
- 既存のファイルに一切影響を与えない新規追加のバッチスクリプトです。

## [2026-06-22 19:42] ステップ6: 環境変数の設定
### 変更ファイル
- [.env.example](file:///Users/kurokawamutsuo/開発フォルダ/051_AI文書検索作成Proj/.env.example)（変更）
- [.env](file:///Users/kurokawamutsuo/開発フォルダ/051_AI文書検索作成Proj/.env)（変更）
- [app/api/.env](file:///Users/kurokawamutsuo/開発フォルダ/051_AI文書検索作成Proj/app/api/.env)（変更）
### 変更内容
- `.env.example` およびルートの `.env` に、ベクトルストアのパス `VECTOR_STORE_PATH=/data/vector_store`、埋め込みモデル名 `EMBEDDING_MODEL=intfloat/multilingual-e5-small`、RAGバックエンド切替スイッチ `RAG_BACKEND=vector` を追記しました。
- `app/api/.env` にはローカル実行環境用のパス構成として `VECTOR_STORE_PATH=/Users/kurokawamutsuo/開発フォルダ/051_AI文書検索作成Proj/db/vector_store` を追記しました。
### 判断・選択
- 要件定義書の「3.8 .env.example への追記」に対応。
- 安全装置である `RAG_BACKEND=vector` によって、即座に FTS5 検索への切り戻しができる体制を整えました。
### 確認結果
- 各環境変数定義ファイルの書き込み完了。
### 禁止事項チェック
- 「0.1 禁止事項」に該当する変更はありません。

## [2026-06-22 19:44] ステップ7: docker-compose.yml の調整
### 変更ファイル
- [docker-compose.yml](file:///Users/kurokawamutsuo/開発フォルダ/051_AI文書検索作成Proj/docker-compose.yml)（変更）
### 変更内容
- `open-notebook` サービスについて、コメントに「将来統合用・現在未使用」「SurrealDB未設定のため、本改修では起動させない」旨を明記しました。
- 意図せぬコンテナ起動を防ぐために、`profiles` 設定に `unused` を割り当て、`restart: "no"` に変更しました。
### 判断・選択
- 要件定義書の「3.7 docker-compose.yml の確認」に対応。
- `docker-compose.yml` のサービス定義自体は残しつつ、標準の `docker compose up` では起動しないように構成しました。
### 確認結果
- docker-compose.yml の記述修正完了。
### 禁止事項チェック
- 「0.1 禁止事項」に該当する変更はありません。

## [2026-06-22 20:01] ステップ8: 再インデックスの実行
### 変更ファイル
- なし（実行ログのみ）
### 変更内容
- api コンテナ内で `reindex_vectors.py` を実行し、SQLite データベースの `documents_fts` テーブルに登録されていた既存文書（`sample_rules.txt`）を Chroma ベクトルストアに正常にインデックス同期しました。
  - 再インデックス対象件数: 1件
  - `sample_rules.txt` (1 チャンク) が正常にベクトル化され、登録完了。
### 判断・選択
- 要件定義書の「3.6 既存文書の再インデックス用スクリプト」に対応。
- api コンテナ内の `/app/reindex_vectors.py` を実行するため、ホストから `docker compose exec api python reindex_vectors.py` の形で実行しました。
### 確認結果
- 実行出力: `--- 再インデックス完了: 成功 1 / 1 件 ---` を確認。エラーなし。
### 禁止事項チェック
- 「0.1 禁止事項」に該当する変更はありません。

