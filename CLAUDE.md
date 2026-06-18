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
フロントエンド (Next.js) ──REST API──▶ FastAPI バックエンド
  Port: 3002                              Port: 8000
                                           ├── RAGエンジン
                                           ├── NL2SQLエンジン (Step2)
                                           ├── 文書生成 (Word/Excel/PPT)
                                           ├── 音声認識 (Whisper tiny)
                                           └── 監査ログサービス
                                                  │
                   ┌───────────────────────────────┤
                   ▼                               ▼
          ローカルLLM (Ollama)            SQLiteデータベース
          Port: 11434                     ├── knowledge.db (FTS5/RAG)
          Model: qwen2.5-coder:1.5b       └── business.db (販売・会計)
          (高スペック時: gemma3:12b)
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

| サービス | URL |
|:---|:---|
| チャットUI (メイン画面) | http://localhost:3002 |
| FastAPI Swagger | http://localhost:8000/docs |
| API ヘルスチェック | http://localhost:8000/health |
| Ollama LLM | http://localhost:11434 |
| Open Notebook | http://localhost:5001 |

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
│   │   │   └── search.py       ← 全文検索
│   │   ├── services/
│   │   │   ├── rag_engine.py   ← RAG検索・LLMプロンプト管理
│   │   │   ├── llm_client.py   ← Ollama接続クライアント
│   │   │   └── db.py           ← SQLite FTS5 初期化
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
```

---

## 6. 重要な実装上の制約・注意点

### ⚠️ リソース制約
- **RAM 8GB / CPUのみ** の環境を想定。`gemma3:12b` や `gemma3:4b` は OOM クラッシュのため使用不可。
- 現在の動作モデルは `qwen2.5-coder:1.5b`（約986MB）。
- Ollama の payload options に `"num_predict": 150` を付与し、無限トークン生成ループを防止している。

### 🔒 セキュリティ設計（変更禁止）
NL2SQL の安全性は以下の **二重防御**で担保しており、絶対に緩和しないこと：
1. **物理防御**: DB接続URIに `?mode=ro` を付与 → SQLiteが書き込みを物理的に拒否
2. **ポリシー制御**: `nl2sql_engine.py::is_safe_query()` による禁止キーワード検知・セミコロン遮断

### 🐳 Dockerマウント設定
`docker-compose.yml` の api サービスに以下のマウントが定義されている：
- `./step2:/app/step2` → NL2SQLモジュールをコンテナ内で参照
- `./tests:/app/tests` → 統合テストをコンテナ内で実行するため

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

---

## 9. 現在の動作確認済み機能（テスト済み）

| 機能 | ステータス | 備考 |
|:---|:---:|:---|
| RAG全文検索・チャット回答 | ✅ 完了 | SQLite FTS5 + Ollama |
| ファイル監視・自動インデクシング | ✅ 完了 | watchdog + ポーリング(300秒) |
| 音声認識 (Whisper) | ✅ 完了 | tiny モデル / 日本語対応 |
| Word/Excel/PPT自動生成 | ✅ 完了 | python-docx/openpyxl/python-pptx |
| PDF財務分析・Chart.jsダッシュボード | ✅ 完了 | フォールバック付き |
| Brave外部検索 | ✅ 完了 | デフォルトOFF・APIキー設定時のみ有効 |
| NL2SQL（自然言語→SQL生成） | ✅ 完了 | qwen2.5-coder:1.5b |
| セキュリティブロック（DROP/UPDATE等） | ✅ 完了 | 物理防御 + ポリシー防御の二重構造 |
| 監査ログ記録 | ✅ 完了 | execution/blocked/error の3区分 |
| 統合テスト (E2E) | ✅ 完了 | 6/6 Pass |

---

## 10. 次のステップ（将来的な課題）

1. **本番DBスキーマへの差し替え**: `step2/schema_catalog/catalog.yaml` のテーブル定義・KPI計算式を、実際の会計・販売システムのスキーマに合わせて書き換える。
2. **高精度モデルへの移行**: VRAMが十分な環境（GPU搭載 / RAM 32GB以上）では `OLLAMA_MODEL=gemma3:12b` に変更することで、NL2SQLのJOIN精度が大幅に向上する。
3. **PoC実施**: 実ユーザーによる試用・フィードバック収集・チューニング。
