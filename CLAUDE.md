# AVITO - AI駆動型ナレッジ&データ活用プラットフォーム
## Claude Code 引き継ぎドキュメント (CLAUDE.md)

> このファイルは Claude Code が自動で読み込むプロジェクトコンテキスト定義です。
> プロジェクトの変更・拡張を行う際は、常にこのファイルを最新化してください。

---

## 1. プロジェクト概要

**プロジェクト名**: AVITO (アビト)  
**クライアント**: SuccessKnowledge LLC / Aoba System Co.,Ltd.  
**目的**: 完全ローカル・閉域網動作する AI 駆動型ナレッジ検索・DB 連携・文書作成支援プラットフォーム  
**現在バージョン**: AVITO II (DB連携・NL2SQL機能実装済み)  
**開発ステータス**: 全フェーズ (Phase 0〜4) 完了

---

## 2. システム全体構成

```
ユーザー (ブラウザ)
  │ HTTP
  ▼
フロントエンド (Next.js)                  Port: 3102
  ├── 左パネル: ソース管理
  │     手動入力（ファイル/ローカルPATH/サーバPATH/URL）＋ 自動入力（キーワード検索）常時併存
  │     設定モーダル（watch-paths管理）
  ├── 中央パネル: チャット
  │     プロンプトボックス 4×2グリッド（チャット入力欄の上部・常時表示）
  │       1〜4: 見積/管理資料/提案書/報告書 作成用テンプレート → 入力欄へ転記のみ（送信はしない）
  │       5〜8: カスタム追加（空枠、将来の設定連携用）
  └── 右パネル: 出力（旧Studioパネル）／メモ タブ
        出力ボックス 2×3グリッド
          1〜3: エクセル/ワード/パワーポイント出力 → /api/output/generate を直接呼ぶ
          4〜6: カスタム追加（空枠）
        出力結果一覧（/api/output/files・ダウンロードリンク）
  │ REST API
  ▼
FastAPI バックエンド                      Port: 3101
  ├── RAGエンジン (ベクトル検索: LlamaIndex+ChromaDB+e5-small / RAG_BACKEND=fts5でFTS5に切替可)
  ├── NL2SQLエンジン (Step2)
  ├── 文書生成 (Word/Excel/PPT) ※/api/documents/generate は単体APIとして残置、チャットからは呼ばない
  ├── 出力生成 (チャット履歴→Excel/Word/PPT、/api/output/*)
  ├── ソース管理 (アップロード/パス参照/URL/自動検索、/api/sources/*)
  ├── 設定管理 (watch-paths/モデル切替、/api/settings/*)
  ├── 音声認識 (Whisper tiny)
  └── 監査ログサービス
         │
    ┌────┴───────────────────────┬───────────────────────┐
    ▼                            ▼                       ▼
ローカルLLM (Ollama)      SQLiteデータベース        ベクトルストア (ChromaDB)
Port: 3107                ├── knowledge.db          /data/vector_store
Model: qwen2.5-coder:1.5b │   (FTS5/RAG/sources/    Embedding: ローカルHuggingFace
(高スペック時: gemma3:12b) │    watch_paths/         intfloat/multilingual-e5-small
                           │    chat_history/        （Ollamaとは独立・モデル切替の影響なし）
                           │    output_files/
                           │    settings)
                           └── business.db (販売・会計)
                           ▲
                    ファイル監視クローラー
                    (watchdog + ポーリング)
```

---

## 3. 起動方法

```bash
# プロジェクトルートで実行
docker compose up -d

# 稼働確認
docker compose ps
```

### サービスURL一覧

> ポート割り当ては `/Users/kurokawamutsuo/開発フォルダ/997_開発ナレッジ/04_PORT_MANAGEMENT.md` のポート台帳（051_AI文書検索作成Proj: 3100-3109）に準拠。

| サービス | URL |
|:---|:---|
| チャットUI (メイン画面) | http://localhost:3102 |
| FastAPI Swagger | http://localhost:3101/docs |
| API ヘルスチェック | http://localhost:3101/health |
| Ollama LLM | http://localhost:3107 |
| Open Notebook（将来統合用・現在未使用） | http://localhost:3104（`docker compose --profile open-notebook up -d` で個別起動が必要。通常の`docker compose up -d`では起動しない） |

---

## 4. ディレクトリ構成

```
051_AI文書検索作成Proj/
├── CLAUDE.md                   ← このファイル（引き継ぎ定義）
├── docker-compose.yml          ← 全サービスの起動定義
├── .env                        ← 環境変数 (OLLAMA_MODEL等)
├── .env.example                ← 環境変数テンプレート
├── progress-dashboard.html     ← 開発進捗ダッシュボード（全Phase完了済み）
│
├── app/
│   ├── api/                    ← FastAPI バックエンド
│   │   ├── main.py             ← エントリポイント・ルーター登録
│   │   ├── routers/
│   │   │   ├── chat.py         ← RAGチャット・PDF分析
│   │   │   ├── db_query.py     ← NL2SQL API (/api/db/query, /api/db/audit-logs)
│   │   │   ├── documents.py    ← Word/Excel/PPT生成
│   │   │   ├── voice.py        ← Whisper音声認識
│   │   │   ├── search.py       ← 全文検索
│   │   │   ├── sources.py      ← ソース管理・自動検索 (/api/sources/*)
│   │   │   └── settings.py     ← watch-paths設定管理 (/api/settings/*)
│   │   ├── services/
│   │   │   ├── rag_engine.py   ← RAG検索・LLMプロンプト管理（RAG_BACKENDで検索方式を切替）
│   │   │   ├── vector_engine.py ← LlamaIndexベクトルエンジン（ChromaDB + e5-small）
│   │   │   ├── llm_client.py   ← Ollama接続クライアント
│   │   │   └── db.py           ← SQLite FTS5 初期化
│   │   ├── reindex_vectors.py  ← 既存文書をベクトルストアへ再インデックスするバッチスクリプト
│   │   └── requirements.txt
│   └── frontend/               ← Next.js フロントエンド
│       └── src/app/
│           ├── page.tsx        ← メインチャットUI（NL2SQLテーブル表示含む）
│           └── globals.css
│
├── step2/                      ← NL2SQL・DB連携モジュール (AVITO II)
│   ├── nl2sql/
│   │   └── nl2sql_engine.py    ← SQL生成・安全実行エンジン
│   ├── schema_catalog/
│   │   ├── catalog.yaml        ← 業務定義カタログ（テーブル・KPI定義）
│   │   └── catalog_manager.py  ← カタログ読み込み・LLMプロンプトへの注入
│   ├── audit_log/
│   │   └── audit_service.py    ← 監査ログ記録サービス
│   ├── sample_db_setup.py      ← 模擬ビジネスDB構築スクリプト
│   ├── add_indexes.py          ← DBインデックス最適化スクリプト
│   └── test_nl2sql.py          ← NL2SQL E2Eテストスクリプト
│
├── crawler/
│   └── pc_crawler.py           ← ファイル監視クローラー（watchdog+ポーリング）
│
├── tests/
│   └── integration/
│       └── test_integration.py ← 統合テスト (6テスト全Pass済み)
│
├── watch/                      ← RAG監視対象フォルダ（ここにドキュメントを配置）
│
├── test-business-docs/         ← 自動検索(watch-paths)機能の動作確認用フォルダ
│
└── docs/                       ← 納品ドキュメント一式
    ├── ユーザーマニュアル.md         ← AVITO II対応版
    ├── 運用手順書.md
    ├── システム詳細設計書.md
    ├── セキュリティ監査レポート.md
    ├── フェデレーテッドデータマート設計書.md
    └── 開発計画書.md
```

---

## 5. 環境変数 (.env) の主要項目

```ini
OLLAMA_MODEL=qwen2.5-coder:1.5b  # RAM 8GB CPU環境の推奨値
                                   # 高スペック環境: gemma3:12b / qwen2.5-coder:7b
OLLAMA_TIMEOUT=120
BRAVE_SEARCH_ENABLED=false        # 外部検索は常にデフォルトOFF
SQLITE_DB_PATH=/data/sqlite/knowledge.db

# ----- ベクトル検索（LlamaIndex） -----
VECTOR_STORE_PATH=/data/vector_store
EMBEDDING_MODEL=intfloat/multilingual-e5-small
RAG_BACKEND=vector  # "fts5"でFTS5フォールバックに切替可能（安全装置・要コンテナ再作成）

# ----- 外部Ollama（Google Colab） -----
OLLAMA_REMOTE_URL=  # ngrok経由の外部Ollama接続URL
OLLAMA_REMOTE_TIMEOUT=300
```

---

## 6. 重要な実装上の制約・注意点

### ⚠️ リソース制約
- **RAM 8GB / CPUのみ** の環境を想定。`gemma3:12b` や `gemma3:4b` は OOM クラッシュのため使用不可。
- 現在の動作モデルは `qwen2.5-coder:1.5b`（約986MB）。
- Ollama の payload options に `"num_predict": 150` を付与し、無限トークン生成ループを防止している。

### 🗂️ チャットと出力（ファイル生成）の分離
- `/api/chat/` は会話（テキスト回答 + citations）のみを担当する。ファイル生成トリガーは持たない。
- ファイル生成は `/api/output/generate` に分離されており、`chat_history` テーブルに保存された
  セッションの会話履歴を読み出し、Ollamaで構造化ドラフトを生成した上で、
  `documents.py` の既存生成関数（`_generate_word` / `_generate_excel` / `_generate_pptx`）を再利用してファイル化する。
- `chat.py` の `/` エンドポイントは、回答生成後に user/assistant 両方のメッセージを
  `chat_history` テーブルへ保存する（このテーブルは元々スキーマのみ存在し書き込まれていなかったため、
  `/api/output/` のために新たに永続化処理を追加した）。
- 生成済みファイルは `output_files` テーブル（`/data/output_files` ボリューム）に記録され、
  `GET /api/output/files?session_id=...` で一覧取得、`GET /api/output/download/{file_id}` でダウンロードする。

### 📂 ソース登録方式（手動入力＋自動入力 常時併存）
- 左パネルの「自動モード/手動モード」トグルは廃止し、手動入力（ファイル/ローカルPATH/ファイルサーバPATH/WEBのURL）と
  自動入力（`/api/sources/auto-search` のキーワード検索結果から「+追加」）を常時併存させる単一のソース一覧UIに統一した。
  `source_mode` は常に `"manual"` を送信し、チェックを入れたソースの `id` のみが `selected_source_ids` として
  `/api/chat/` に渡される。
- `sources` テーブルに `source_type` 列を追加（`upload`/`memo`/`url`/`local_path`/`server_path`/`auto_search`）。
  **`local_path`/`server_path`/`auto_search` はファイルをコピーせずパス参照のみで登録するため、
  ソース削除時も元ファイルは物理削除しない**（`upload`/`memo`/`url` のみ `SOURCES_DIR` 配下の実ファイルを削除する）。
  この判定は `routers/sources.py::MANAGED_SOURCE_TYPES` で行う。
- 新規ソースの `selected` はすべて **デフォルトOFF**（旧実装はDEFAULT 1だったが変更した）。
- `ChatRequest.selected_source_ids` は当初 `list[str]` だったが、フロントエンドは `Source.id`（`number`）の配列を
  そのまま送信するため実際には常に整数で届き、`422 Unprocessable Entity` を引き起こすバグがあった。
  ブラウザでの実E2E検証で発見し、`list[int]` に修正済み（`rag_engine.py` の型ヒントも同様に修正）。

### 📌 RAGの実装実態（LlamaIndex ベクトル検索移行）
- RAGの中核検索エンジンを SQLite FTS5 から、**LlamaIndex によるベクトル検索（ChromaDB 永続化 + `intfloat/multilingual-e5-small`）** に移行しました。
- 登録処理 (`sources.py` 内) では FTS5 と ChromaDB（`vector_engine.py`）の両方にドキュメントを追加し、検証・ロールバック性を維持しています。
- **安全装置 (ロールバック)**: `.env` 内の `RAG_BACKEND`（`vector` または `fts5`）を切り替えてコンテナを再起動（`docker compose up -d`）することで、即座に旧 FTS5 全文検索に戻すことができます。
- **メタデータ競合対策**: LlamaIndex の内部仕様による `doc_id` メタデータの上書き（UUID化）を防ぐため、`vector_engine.py` で `Document` を構築する際、`id_=doc_id`（正規化済みファイルパス）を明示的に指定してインデックス化を行っています。
- `docker-compose.yml` 内の `open-notebook` サービスは `profiles: ["open-notebook"]` を指定し、通常の `docker compose up -d` では起動しないように構成しています。
- **初期化失敗時のフェイルセーフ（Claude Codeブラッシュアップで追加）**: `vector_engine.py::VectorEngine.__init__()` は当初、Embeddingモデルロード等に失敗すると例外を再raiseしていたが、`rag_engine.py` がモジュールimport時点で `vector_engine` をimportしているため、**初期化失敗時にAPI全体が起動不能になる**（`RAG_BACKEND=fts5` のフォールバックすら使えなくなる）という重大なリスクがあった。`self.index=None` のまま握って非致命化し、各メソッド（`index_document`/`remove_document`/`search`）側で未初期化時に安全に縮退動作（ログ警告＋空リスト/早期return）するように修正済み。
- **`should_use_rag()` とのフレーズ競合（既知の制約）**: `should_use_rag()`（`chat.py`、変更禁止）の `skip_phrases` に含まれる `"教えて"` は、`"5月が赤字の原因を教えてください"` のような**具体的な内容を問う質問にも誤マッチし、RAGをスキップしてしまう**。受け入れ基準のテスト文言そのものがこの影響を受けるため、動作確認時は `"...教えて"` を含まない言い回し（例:「5月の損失の主な原因は何ですか」）を使うこと。`should_use_rag()` 自体は「直近で実装・検証済み」のため本改修では変更していない。
- **検索精度と生成精度の切り分け**: ベクトル検索自体は正しく機能しており、関連チャンクを類似度0.7前後で正確に取得できることを確認済み（例:「4月の売上はいくらですか」→`13,670,324円`の行を含むチャンクをスコア0.70で取得）。一方、`qwen2.5-coder:1.5b`（コード特化・1.5Bパラメータの軽量モデル）は日本語の財務文書読解・多桁数値の転記精度に限界があり、同じ質問でも生成結果が`13,670,324`→`1,670,324`のように桁を欠落させる、または中国語混じりの文章を生成することがある。これは**検索（vector_engine.py）の不具合ではなく、生成モデル側の能力的な限界**。回答精度を上げたい場合はモデル切替UI（`gemma3:12b`等、ただし8GB RAM環境ではOOMリスクあり）で対応すること。

### ☁️🌐 外部LLM対応（Claude API / 外部Ollama）
- モデル名のプレフィックスでバックエンドを判定する: `claude-`始まり→Claude API、`remote/`始まり→外部Ollama（`OLLAMA_REMOTE_URL`）、それ以外→ローカルOllama。
- いずれも選択時に「外部送信が発生する」警告UIが出る**オプトイン機能**（CLAUDE.mdの「完全ローカル・閉域網動作」の絶対要件に対する明示的な例外）。本番環境ではローカルOllamaのみに戻すこと。
- **修正済みバグ（Claude Codeブラッシュアップで修正）**: `_get_ollama_url()` は `remote/` モデル選択中に `OLLAMA_REMOTE_URL` が未設定（例: 設定画面でURLを空にして保存した後）だと `ValueError` を投げる仕様だが、この呼び出しが `chat()`/`generate()` 内で引数評価時（try-exceptの外）に行われていたため、例外がそのまま伝播し `/api/chat/` が500エラーになるバグがあった。`chat()`/`generate()` 側で `_get_ollama_url()` の呼び出しをtry-exceptで囲み、失敗時はフォールバック応答を返すよう修正済み。
- 外部Ollama（Google Colab+ngrok）は本物のトンネルでの実機検証（チャット応答の実取得）が未実施。`docs/Colab_Ollama_セットアップ手順.md` の手順で接続後、設定画面から動作確認すること。

### 🔒 セキュリティ設計（変更禁止）
NL2SQL の安全性は以下の **二重防御**で担保しており、絶対に緩和しないこと：
1. **物理防御**: DB接続URIに `?mode=ro` を付与 → SQLiteが書き込みを物理的に拒否
2. **ポリシー制御**: `nl2sql_engine.py::is_safe_query()` による禁止キーワード検知・セミコロン遮断

### 🐳 Dockerマウント設定
`docker-compose.yml` の api サービスに以下のマウントが定義されている：
- `./step2:/app/step2` → NL2SQLモジュールをコンテナ内で参照
- `./tests:/app/tests` → 統合テストをコンテナ内で実行するため
- `./test-business-docs:/mnt/watch_roots/test-business-docs:ro` → 自動検索(watch-paths)機能の動作確認用フォルダ（下記参照）

### 🔍 自動検索 (watch-paths) のフォルダ追加手順
ファイル名キーワード検索 (`GET /api/sources/auto-search`) は、`watch_paths` テーブルに登録された
**コンテナ内パス**配下のみを再帰検索する。Dockerはコンテナ起動時にマウントしたパスしか
コンテナ内から見えないため、新しいホストフォルダ（ローカルPATH・ファイルサーバのUNC/マウントパス等）を
検索対象に追加する場合は、以下の手順で行うこと。

1. `docker-compose.yml` の `api` サービスの `volumes` に、以下の規約でマウントを追記する。
   ```yaml
   - <ホストの実パス>:/mnt/watch_roots/<任意のフォルダ名>:ro
   ```
   例（テスト用に設定済み）:
   ```yaml
   - ./test-business-docs:/mnt/watch_roots/test-business-docs:ro
   ```
   ファイルサーバの場合は、事前にホストOS側でネットワークドライブを `/Volumes/xxx` 等にマウントしておき、
   そのマウントポイントをホスト側パスとして指定する。
2. `docker compose up -d` でコンテナを再作成し、マウントを反映する。
3. `POST /api/settings/watch-paths` に、手順1で決めた**コンテナ内パス**（`/mnt/watch_roots/<フォルダ名>`）と
   表示用の `label` を渡して登録する。
   ```bash
   curl -X POST http://localhost:3101/api/settings/watch-paths \
     -H "Content-Type: application/json" \
     -d '{"path": "/mnt/watch_roots/<フォルダ名>", "label": "<表示名>"}'
   ```
4. 登録後は `GET /api/sources/auto-search?keyword=...` で、そのフォルダ配下もファイル名検索の対象になる。
   検索結果はあくまで候補表示であり、ソース一覧への正式追加（`/api/sources/upload` 等）は別操作。

### 📦 モデルの追加Pull方法
```bash
docker compose exec ollama ollama pull gemma3:12b
```

---

## 7. よく使うコマンド集

```bash
# 統合テスト実行（コンテナ内で実行すること）
docker compose exec api python -m unittest tests/integration/test_integration.py

# NL2SQL E2Eテスト（コンテナ内）
docker compose exec api python step2/test_nl2sql.py

# 模擬ビジネスDBを再作成
docker compose exec api python step2/sample_db_setup.py

# DBインデックス最適化
docker compose exec api python step2/add_indexes.py

# 既存文書をベクトルインデックスに再登録（モデル変更後や初回セットアップ時）
docker compose exec api python reindex_vectors.py

# APIコンテナのログ確認
docker compose logs -f api

# コンテナ全体の状態確認
docker compose ps

# 特定コンテナの再起動
docker compose restart api
```

---

## 8. APIエンドポイント一覧

| Method | Path | 機能 |
|:---|:---|:---|
| GET | `/health` | ヘルスチェック |
| POST | `/api/chat/` | RAGチャット問い合わせ |
| POST | `/api/chat/stream` | RAGチャット（ストリーミング） |
| POST | `/api/chat/analyze-pdf` | PDF財務解析・ダッシュボード生成 |
| POST | `/api/db/query` | **自然言語→SQL自動生成・実行 (NL2SQL)** |
| GET | `/api/db/audit-logs` | 監査ログ取得 |
| POST | `/api/voice/transcribe` | 音声→テキスト変換 (Whisper) |
| POST | `/api/documents/generate` | Word/Excel/PPT自動生成 |
| GET | `/api/search/` | 全文検索 |
| GET | `/api/sources/` | ソース一覧取得 |
| POST | `/api/sources/upload` | ソースファイルアップロード（RAGインデックス自動追加） |
| PATCH | `/api/sources/{source_id}` | ソースの選択状態（手動参照モード用）更新 |
| DELETE | `/api/sources/{source_id}` | ソース削除 |
| POST | `/api/sources/memo` | メモをソースとして保存 |
| GET | `/api/sources/suggestions` | ソース内容に応じた推奨プロンプトの動的生成 |
| GET | `/api/sources/auto-search` | watch-paths配下のファイル名キーワード検索（候補表示のみ） |
| POST | `/api/sources/from-path` | パス参照のままソース登録（ファイルコピーなし、local_path/server_path/auto_search） |
| POST | `/api/sources/from-url` | WEBページのURLからテキスト抽出してソース登録 |
| GET | `/api/settings/watch-paths` | 自動検索対象パス一覧取得 |
| POST | `/api/settings/watch-paths` | 自動検索対象パスの登録（コンテナ内パスが必要） |
| DELETE | `/api/settings/watch-paths/{id}` | 自動検索対象パスの登録解除 |
| GET | `/api/settings/remote-url` | 外部Ollama URLおよび接続状態取得 |
| PATCH | `/api/settings/remote-url` | 外部Ollama URLの設定・DB保存・リアルタイム反映 |
| POST | `/api/output/generate` | チャット履歴からExcel/Word/PowerPointファイルを生成 |
| GET | `/api/output/files` | セッションの生成済み出力ファイル一覧取得 |
| GET | `/api/output/download/{file_id}` | 生成済み出力ファイルのダウンロード |

---

## 9. 現在の動作確認済み機能（テスト済み）

| 機能 | ステータス | 備考 |
|:---|:---:|:---|
| RAGベクトル検索・チャット回答 | ✅ 完了 | LlamaIndex + ChromaDB + e5-small + Ollama。`RAG_BACKEND=fts5`でFTS5フォールバックに切替可能 |
| 外部Ollama（Google Colab）対応 | ✅ 完了 | `remote/`プレフィックスのモデル名で判定。設定画面のURL入力・接続確認・保存・モデル一覧反映まで実装済み。本物のColab+ngrok接続でのチャット応答（受け入れ基準#7）は実機検証未実施 |
| ファイル監視・自動インデクシング | ✅ 完了 | watchdog + ポーリング(300秒) |
| 音声認識 (Whisper) | ✅ 完了 | tiny モデル / 日本語対応 |
| Word/Excel/PPT自動生成 | ✅ 完了 | python-docx/openpyxl/python-pptx |
| PDF財務分析・Chart.jsダッシュボード | ✅ 完了 | フォールバック付き |
| Brave外部検索 | ✅ 完了 | デフォルトOFF・APIキー設定時のみ有効 |
| NL2SQL（自然言語→SQL生成） | ✅ 完了 | qwen2.5-coder:1.5b |
| セキュリティブロック（DROP/UPDATE等） | ✅ 完了 | 物理防御 + ポリシー防御の二重構造 |
| 監査ログ記録 | ✅ 完了 | execution/blocked/error の3区分 |
| 統合テスト (E2E) | ✅ 完了 | 6/6 Pass |
| ソース管理（手動入力＋自動入力 常時併存） | ✅ 完了 | ファイル/ローカルPATH/サーバPATH/URL登録、auto-search候補追加 |
| watch-paths設定（自動検索対象フォルダ管理） | ✅ 完了 | 設定モーダルから追加・削除 |
| チャット履歴からのファイル出力（Excel/Word/PPT） | ✅ 完了 | `/api/output/*`、右パネル「出力」から直接生成 |
| 中央エリアのプロンプトテンプレート 4×2グリッド | ✅ 完了 | 見積/管理資料/提案書/報告書、入力欄へ転記のみ（送信は手動） |

---

## 10. 次のステップ（将来的な課題）

**完了済み（ステップ1〜6）**:
- ステップ1: 設定API（watch-paths）・ソース自動検索API（auto-search）
- ステップ2: チャット履歴からのファイル出力API（`/api/output/*`）とチャット/出力の機能分離
- ステップ3: パス参照型ソース登録API（`from-path`/`from-url`）と左パネルの手動＋自動入力UI統合
- ステップ4: 中央エリアのプロンプトテンプレート4×2グリッド化、右パネルの「出力」改称・6ボックス化、ファイルチップ廃止
- ステップ5: **LlamaIndexベクトル検索の実装**（Antigravity一次実装 → Claude Codeブラッシュアップ）。SQLite FTS5キーワード検索から、ChromaDB永続化 + `intfloat/multilingual-e5-small` によるベクトル（意味）検索へ移行。`RAG_BACKEND`環境変数でFTS5への即時ロールバックが可能な安全装置付き。
- ステップ6: **外部Ollama（Google Colab）対応**。プレフィックス `remote/` モデル対応、OLLAMA_REMOTE_URL の接続確認・DB保存設定、設定UI（接続テスト・警告表示）、およびタイムアウト制御の追加。

**残課題**:
1. **プロンプトボックス5〜8（カスタム追加）の設定連携**: 現在は空枠のみ。ユーザーが独自のプロンプトテンプレートを登録・編集できる設定UI・APIが必要。
2. **出力ボックス4〜6（カスタム追加）の設定連携**: 同上。Excel/Word/PPT以外の出力形式や、独自テンプレートに基づく出力を追加できるようにする。
3. **会社の定型フォーマットへの対応**: 出力時に既存の社内フォーマット（Excelテンプレート等）を読み込み、その体裁を維持したまま出力する機能。
4. **Word/PPT出力の品質向上**: 現行 `qwen2.5-coder:1.5b` では構成・体裁の粒度が粗い。`gemma3:12b` 等の高精度モデルへの切り替えで改善見込み（モデル切替UIは実装済み。ただし8GB RAM環境ではOOMクラッシュのリスクがあるため要注意）。
5. **本番DBスキーマへの差し替え**: `step2/schema_catalog/catalog.yaml` のテーブル定義・KPI計算式を、実際の会計・販売システムのスキーマに合わせて書き換える。
6. **PoC実施**: 実ユーザーによる試用・フィードバック収集・チューニング。
7. **Open Notebook本体の統合**（将来フェーズ）: SurrealDB追加・Open Notebook REST API連携によるNotebookLM互換のノート管理・ポッドキャスト生成。工数2〜3週間。ベクトル検索が安定運用された後に検討。
8. **ハイブリッド検索**: FTS5（キーワード）とベクトル（意味）のスコアを統合し、検索精度をさらに向上させる。
9. **出典のページ番号表示**: チャンクにページ番号メタデータを付与し、NotebookLM同様の精密な出典表示を実現する。
