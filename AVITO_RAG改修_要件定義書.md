# AVITO RAG基盤改修 要件定義書
## LlamaIndex ベクトル検索の実装（提案書アーキテクチャ準拠）

**文書バージョン**: 1.0
**作成日**: 2026-06-22
**対象プロジェクト**: AVITO（success-avito-proj）
**改修担当**: Antigravity（一次実装）→ Claude Code（ブラッシュアップ）

---

## 0. この文書の読み方（実装AIへの最重要指示）

> **この要件定義書は「契約書」です。記載された範囲のみを実装し、記載のない変更を一切行わないこと。**

### 0.1 絶対厳守の禁止事項（DO NOT）

以下は**現状正常に動作している機能**です。**絶対に変更・削除・リファクタリングしてはいけません**。

| # | 禁止対象 | 理由 |
|---|---------|------|
| 1 | `app/api/routers/output.py`（Excel/Word/PPT生成） | 直近で完成・検証済み。RAG改修と無関係 |
| 2 | `app/api/routers/documents.py`（`_generate_excel`等） | 見積書フォーマット実装済み。触ると壊れる |
| 3 | `app/api/routers/sources.py` の `_extract_text()` / `from-path` / `auto-search` / NFKC正規化処理 | 直近でNFD問題を修正済み。再発させない |
| 4 | `app/api/routers/settings.py`（watch-paths / model切替） | 完成・検証済み |
| 5 | `app/api/routers/voice.py`（Whisper） | 完成・検証済み |
| 6 | `step2/`（NL2SQL・二重防御）配下すべて | セキュリティ実装。緩和厳禁 |
| 7 | フロントエンド `page.tsx` の3カラムUI・8枠グリッド・出力パネル・提案チップ・ライトテーマ | 直近で全面改修・検証済み。**UI変更は本改修のスコープ外** |
| 8 | `should_use_rag()` のスキップ判定ロジック | 直近で実装・検証済み |
| 9 | `chat_history` テーブルへの保存処理 | output.pyの生成元データ。壊すと出力機能が死ぬ |

### 0.2 本改修のスコープ（DO）

**RAGの「検索方式」だけを、FTS5キーワード検索からベクトル検索に差し替える。** それ以外は何も変えない。

- 変更してよいファイル: `rag_engine.py`（中核）、`requirements.txt`、`docker-compose.yml`、`.env.example`、新規追加する `vector_engine.py`
- UIは変更しない（内部処理の差し替えのみ。ユーザーの操作・画面は一切変わらない）

### 0.3 もし判断に迷ったら

実装中に「この既存コードは不要では？」と感じても、**勝手に削除しないこと**。本書「7. 削除してよいもの／ダメなもの」に明示されたものだけ削除可能。リストにないものは残す。

---

## 1. 改修の目的と背景

### 1.1 現状の問題

現在のRAGは SQLite FTS5（キーワード全文検索）を使用している。これにより以下の問題が発生している。

- PDFや表データに対し「損益を分析して」と聞いても、キーワード一致した断片しか拾えず、**文書全体を意味的に理解できない**
- 「5月が赤字の原因は？」のような**意味的な質問に答えられない**
- 結果として、NotebookLMのような「資料を読み込んで考える」体験が実現できていない

### 1.2 改修のゴール

**LlamaIndex によるベクトル検索（意味検索）を導入し、FTS5を置き換える。**

- 文書をベクトル化（embedding）して保存
- 質問もベクトル化し、意味的に近い箇所を検索
- 検索結果をLLMに渡して回答生成（このパイプライン自体は現状と同じ）

### 1.3 アーキテクチャ上の位置づけ

提案書「Step1 全体アーキテクチャ」の **③ Open Notebook（RAGエンジン）/ LlamaIndex** に相当する部分を実装する。

> **設計判断**: Open Notebook本体（SurrealDB依存の独立アプリ）の完全統合は工数2〜3週間かつAVITOのUIと二重化するため、**本改修では採用しない**。代わりに、提案書が掲げる本質（ベクトル検索・出典付き回答）を **LlamaIndex をFastAPIに組み込む形**で実現する。これにより既存UI・既存APIをそのまま活かせる。Open Notebook本体の統合は将来の別タスクとする（本書「9. 将来拡張」参照）。

---

## 2. 技術選定

| 項目 | 採用技術 | 理由 |
|------|---------|------|
| ベクトル検索フレームワーク | LlamaIndex | requirements.txtに既にコメントで予約済み。提案書に明記 |
| Embeddingモデル | `intfloat/multilingual-e5-small`（HuggingFace, ローカル） | 日本語対応・軽量（約470MB）・CPU動作可・完全ローカル（外部送信ゼロを維持） |
| ベクトルストア | ChromaDB（ローカル永続化） | `vector_store_data` ボリューム・`VECTOR_STORE_PATH` 環境変数が既に用意済み |
| LLM | Ollama（既存のまま） | 回答生成は現状を踏襲。embeddingとLLMは分離 |

> **重要**: Embeddingは **Ollamaではなく HuggingFace のローカルモデル**を使う。これにより、qwen/gemmaのモデル切替（既存機能）に影響を与えず、embedding品質を安定させる。完全ローカル動作（提案書の絶対要件）も維持される。

---

## 3. 実装内容（詳細）

### 3.1 依存ライブラリの追加（`app/api/requirements.txt`）

コメントアウトされている以下を**有効化**し、バージョンを固定する。

```
# LLM / RAG（コメントを外して有効化）
llama-index-core==0.11.23
llama-index-embeddings-huggingface==0.3.1
llama-index-vector-stores-chroma==0.2.1
chromadb==0.5.15
sentence-transformers==3.0.1
```

> 既存の `# llama-index` 等のコメント行は、上記の具体的なパッケージ名に**置き換える**。

### 3.2 新規ファイル: `app/api/services/vector_engine.py`

ベクトル検索の中核。以下の責務を持つ。

**クラス `VectorEngine` の必須メソッド:**

| メソッド | 入力 | 出力 | 処理 |
|---------|------|------|------|
| `__init__()` | なし | なし | Chroma初期化・embeddingモデルロード・`VECTOR_STORE_PATH`配下に永続化 |
| `index_document(file_path, file_name, content)` | パス・名前・テキスト | なし | テキストをチャンク分割→ベクトル化→Chromaに保存。`doc_id`は既存同様 `str(file_path)` をNFKC正規化したもの |
| `search(query, top_k=5, source_ids=None)` | クエリ・件数・選択ソースID | `list[SearchResult]` | クエリをベクトル化→意味検索。`source_ids`指定時はメタデータでフィルタ |
| `remove_document(file_path)` | パス | なし | 指定文書のベクトルをChromaから削除 |

**設計上の制約:**
- `SearchResult` は既存 `rag_engine.py` のものと**同じdataclass構造**を返す（`file_path, file_name, content, score, snippet`）。これにより `rag_engine.py` 側の `build_context()` をそのまま再利用できる。
- チャンク分割は LlamaIndex の `SentenceSplitter`（chunk_size=512, chunk_overlap=50）を使用。
- `source_ids` でのフィルタは、Chromaのメタデータに `doc_id`（=正規化済みfile_path）を持たせ、`sources`テーブルから引いた `file_path` リストでフィルタする。**NFKC正規化を両側に適用**（直近のNFD修正と同じ方針）。

### 3.3 改修ファイル: `app/api/services/rag_engine.py`

**変更は最小限。`search_fts()` の中身をベクトル検索呼び出しに差し替えるのみ。**

| 変更箇所 | 変更内容 |
|---------|---------|
| import追加 | `from services.vector_engine import vector_engine` |
| `search_fts()` メソッド | **メソッド名・シグネチャは維持**（呼び出し側を壊さないため）。中身を `return vector_engine.search(query, top_k, source_ids)` に差し替え。FTS5のSQL実行部は削除可（本書7参照） |
| `query()` メソッド | **変更不要**（`search_fts`を呼んでいるだけなので自動的にベクトル検索になる） |
| `build_context()` | **変更不要** |
| `clean_fts_query()` | **削除可**（ベクトル検索では不要。本書7参照） |
| `generate_document_draft()` | **変更不要** |

> **重要**: `search_fts` という名前は実態と合わなくなるが、**リネームしない**。呼び出し元（`chat.py`等）への影響を避けるため。名前変更は本改修のスコープ外。

### 3.4 インデックス登録の連動（`app/api/routers/sources.py`）

> ⚠️ このファイルは原則変更禁止だが、**1箇所だけ**追記が必要。

既存の `_index_for_rag(file_path, content)` 関数の**末尾に**、ベクトルインデックスへの登録呼び出しを**追加**する（FTS5登録は残したまま、両方に登録する形）。

```python
# _index_for_rag() の末尾に追記（既存のFTS5登録処理は消さない）
try:
    from services.vector_engine import vector_engine
    vector_engine.index_document(doc_id, file_path.name, content)
except Exception as e:
    logger.warning(f"ベクトルインデックス登録に失敗（FTS5は成功）: {e}")
```

同様に `_unindex(file_path)` の末尾にもベクトル削除を追記:

```python
try:
    from services.vector_engine import vector_engine
    vector_engine.remove_document(doc_id)
except Exception as e:
    logger.warning(f"ベクトルインデックス削除に失敗: {e}")
```

> **なぜFTS5を残すか**: 切り替え期間中のフォールバック・ロールバック容易性のため。ベクトル検索が問題なく動くと確認できた後、FTS5登録の削除は別タスクで判断する。

### 3.5 クローラー連動（`crawler/pc_crawler.py`）

クローラーは API 経由でインデックスを叩く構成のため、**APIの `_index_for_rag` が両方に登録すれば自動的にベクトル化される**。クローラー自体の変更は**不要**。

### 3.6 既存文書の再インデックス用スクリプト: `app/api/reindex_vectors.py`（新規）

既にFTS5に登録済みの文書をベクトルストアにも取り込むワンショットスクリプト。

```python
# 処理概要（実装の指針）
# 1. documents_fts から全 doc_id, file_name, content を取得
# 2. 各文書を vector_engine.index_document() でベクトル化
# 3. 進捗をログ出力
# 4. 完了件数を表示
```

実行方法: `docker compose exec api python reindex_vectors.py`

### 3.7 docker-compose.yml の確認

| 項目 | 対応 |
|------|------|
| `vector_store_data` ボリューム | **既に存在**。変更不要 |
| `VECTOR_STORE_PATH=/data/vector_store` | **既に存在**。変更不要 |
| apiコンテナのメモリ | embeddingモデル+Chromaで約1.5GB増。M1 16GBで動作可。**変更不要だが、起動が重くなる点に留意** |
| open-notebookコンテナ | **本改修では起動させない**。SurrealDB未設定のため。`docker-compose.yml`から削除はせず、コメントで「将来統合用・現在未使用」と明記するに留める |

### 3.8 .env.example への追記

```ini
# ベクトル検索（LlamaIndex）
VECTOR_STORE_PATH=/data/vector_store
EMBEDDING_MODEL=intfloat/multilingual-e5-small
RAG_BACKEND=vector   # "vector"（ベクトル検索）or "fts5"（旧キーワード検索・フォールバック用）
```

> **`RAG_BACKEND` 環境変数**: `rag_engine.search_fts()` の冒頭で分岐させ、`fts5` 指定時は旧来のFTS5検索に戻せるようにする。**これは安全装置**。ベクトル検索で問題が出たら即座にロールバックできる。旧FTS5コードは「7.削除してよいもの」では**削除しない**対象とする。

---

## 4. 処理フロー（改修後）

```
【インデックス時】
ファイル追加（upload / from-path / crawler）
  → _extract_text() でテキスト抽出【既存・変更なし】
  → _index_for_rag()
      ├→ FTS5登録【既存・残す】
      └→ vector_engine.index_document()【新規】
           → SentenceSplitterでチャンク分割
           → e5-smallでベクトル化
           → ChromaDBに保存

【検索時】
チャット送信（source_ids付き）
  → should_use_rag() 判定【既存・変更なし】
  → rag_engine.query()【既存・変更なし】
      → search_fts()【中身だけベクトル検索に差し替え】
           → RAG_BACKEND=vector なら vector_engine.search()
           → RAG_BACKEND=fts5 なら旧FTS5検索（フォールバック）
      → build_context()【既存・変更なし】
      → llm_client.chat()【既存・変更なし】
  → citations付きで回答【既存・変更なし】
```

---

## 5. 受け入れ基準（テスト項目）

実装完了の判定基準。**全項目クリアで完了とする。**

| # | テスト | 期待結果 |
|---|--------|---------|
| 1 | `docker compose build api` | エラーなくビルド完了 |
| 2 | `docker compose up -d` | api が healthy になる |
| 3 | `reindex_vectors.py` 実行 | 既存文書がベクトル化され件数表示 |
| 4 | PDFをソース追加 | FTS5とChroma両方に登録される（ログ確認） |
| 5 | 損益PDFをチェックして「5月が赤字の原因を教えて」 | **減価償却費の増加に言及**した回答が返る（FTS5では不可能だった意味検索） |
| 6 | 「4月の売上はいくら？」 | 13,670,324円 など**正確な数値**を含む回答 |
| 7 | source_ids指定 | 選択したソースのみ検索対象になる（ログで確認） |
| 8 | `RAG_BACKEND=fts5` に変更して再起動 | 旧FTS5検索に戻る（ロールバック確認） |
| 9 | 既存機能の非破壊確認 | Excel/Word/PPT出力・NL2SQL・音声・モデル切替・8枠グリッドが**すべて従来通り動作** |
| 10 | コンソール・APIログ | エラー0件 |

> **テスト9が最重要**。RAG改修によって既存機能が1つでも壊れたら不合格。

---

## 6. 作業手順（Antigravity → Claude Code の二段構え）

### 6.1 フェーズA: Antigravity による一次実装

Antigravityに以下を指示する（本書を添付）。

1. 本要件定義書の「0. 禁止事項」を最優先で遵守すること
2. 「3. 実装内容」を上から順に実装すること
3. **各ステップで何を変更したかを `docs/RAG改修_実装ログ.md` に逐次記録すること**（次項6.3の形式）
4. 受け入れ基準（本書5）のうち、Antigravityが確認できた項目はログに結果を残すこと

### 6.2 フェーズB: Claude Code によるブラッシュアップ

Antigravityの作業完了後、Claude Codeに以下を指示する。

1. `docs/RAG改修_実装ログ.md` と本要件定義書を読み込む
2. Antigravityの実装が本要件定義書から**逸脱していないか監査**する（特に「0.禁止事項」違反がないか）
3. 受け入れ基準（本書5）の全項目を実機検証する
4. コード品質のブラッシュアップ（エラーハンドリング・型・ログの粒度）
5. 既存機能の非破壊確認（テスト9）を重点的に実施
6. CLAUDE.md を最新化する

### 6.3 実装ログの記録形式（`docs/RAG改修_実装ログ.md`）

Antigravityに以下の形式で記録させる。

```markdown
# RAG改修 実装ログ（Antigravity記録）

## [日時] ステップN: <タイトル>
### 変更ファイル
- path/to/file.py（新規 / 変更 / 削除）
### 変更内容
- 具体的に何をどう変えたか（差分の要約）
### 判断・選択
- 要件定義書のどの項に対応するか
- 迷った点・独自判断した点（あれば明記）
### 確認結果
- 動作確認したならその結果
### 禁止事項チェック
- 本書「0.1 禁止事項」に該当する変更をしていないか（self-check）
```

> **このログが、Claude Codeがブラッシュアップする際の唯一の引き継ぎ資料になる。** Antigravityには「未来の別AIが読む前提で、判断の理由まで書く」よう指示する。

---

## 7. 削除してよいもの／ダメなもの

### 7.1 削除してよい（本改修で不要になる）

| 対象 | 条件 |
|------|------|
| `rag_engine.py` の `clean_fts_query()` 関数 | ベクトル検索では不要。ただし `RAG_BACKEND=fts5` フォールバックで使うため、**フォールバック実装が完了してから**削除判断。当面は残す |
| `requirements.txt` の旧コメント行（`# llama-index` 等） | 具体パッケージ名に置換するので実質削除 |

### 7.2 絶対に削除してはいけない

- 本書「0.1 禁止事項」の全項目
- FTS5登録処理（`_index_for_rag`内）※ベクトル検証完了まで二重登録を維持
- `RAG_BACKEND=fts5` 用の旧FTS5検索コード（安全装置）
- `documents_fts` テーブル定義・既存データ
- フォールバック応答（`_generate_fallback_response`）

---

## 8. リスクと対策

| リスク | 影響 | 対策 |
|--------|------|------|
| embeddingモデルのロードでメモリ不足 | api起動失敗 | e5-small（軽量）採用。M1 16GBで検証。不足時はモデルをさらに小型化 |
| Chromaとsourcesのパス不一致（NFD再発） | source_idsフィルタが効かない | index/search両側でNFKC正規化を徹底（直近の修正と同方針） |
| ベクトル化が遅くデモに支障 | UX低下 | reindexは事前バッチ実行。チャット時は検索のみ |
| 既存FTS5機能の破壊 | 全機能停止 | RAG_BACKEND切替で即ロールバック可能に |
| Antigravityが禁止事項を侵犯 | 既存機能破壊 | 実装ログ+Claude Code監査の二重チェック |

---

## 9. 将来拡張（本改修のスコープ外・記録のみ）

- **Open Notebook本体の統合**: SurrealDB追加・Open Notebook REST API連携。NotebookLM互換のノート管理・ポッドキャスト生成が可能になる。工数2〜3週間。本改修のベクトル検索が安定した後に検討。
- **ハイブリッド検索**: FTS5（キーワード）+ベクトル（意味）のスコア統合。精度向上。
- **gemma3:12b切替**: 高スペック環境での回答品質向上（既にモデル切替UIは実装済み）。
- **出典のページ番号表示**: チャンクにページメタデータを付与し、NotebookLM同様の精密な出典表示。

---

## 10. 成果物チェックリスト

実装完了時に以下が揃っていること。

```
□ app/api/services/vector_engine.py（新規）
□ app/api/services/rag_engine.py（search_fts差し替え）
□ app/api/requirements.txt（LlamaIndex有効化）
□ app/api/reindex_vectors.py（新規）
□ app/api/routers/sources.py（_index_for_rag/_unindexに2行ずつ追記のみ）
□ .env.example（VECTOR_STORE_PATH等追記）
□ docs/RAG改修_実装ログ.md（Antigravity記録）
□ CLAUDE.md（最新化）
□ 受け入れ基準 全10項目クリア
```

---

**以上。この要件定義書の範囲を厳守すること。記載外の改修は行わないこと。**
