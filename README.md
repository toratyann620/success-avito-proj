# AI駆動型ナレッジ検索 文書作成支援ツール

> **スタンドアロン型・完全ローカル動作** — 社内文書のクラウド送信ゼロ

---

## 概要

企業の社内ドキュメント（Word / Excel / PowerPoint / PDF）を  
AIが横断的に検索し、報告書・提案書・見積書のドラフトを自動生成するツールです。

- 🔒 **完全ローカル動作** — 情報が外部に出ることはありません
- 🤖 **Gemma3:12b** — 日本語対応ローカルLLM
- 📄 **RAG検索** — 出典付き回答で根拠を追跡可能
- 🎤 **音声入力対応** — しゃべるだけで操作可能（Phase2〜）

---

## 動作環境

| 要件 | 内容 |
|-----|------|
| OS | macOS / Windows 11 / Ubuntu 22.04 |
| Docker Desktop | 4.x 以上（商用利用の場合はライセンス確認） |
| メモリ | 16GB以上推奨（Gemma3:12b使用時） |
| ストレージ | 30GB以上の空き容量（モデル + データ） |
| GPU | あれば高速化（なくてもCPU動作可能） |

---

## クイックスタート

### 1. リポジトリをクローン
```bash
git clone <repository-url>
cd 051_AI文書検索作成Proj
```

### 2. 環境変数を設定
```bash
cp .env.example .env
# .env を編集（最低限の変更はBrave Search APIキーのみ）
```

### 3. 起動
```bash
docker compose up -d
```

> ⚠️ **初回起動時**: Gemma3:12bモデル（約8GB）の自動Pullが始まります。  
> 完了まで10〜30分かかる場合があります。

### 4. アクセス
| サービス | URL |
|---------|-----|
| **チャットUI** | http://localhost:3002 |
| **API ドキュメント** | http://localhost:8000/docs |
| **Open Notebook** | http://localhost:5001 |
| **Ollama** | http://localhost:11434 |

---

## 監視フォルダの設定

`watch/` フォルダ内にインデクシングしたいドキュメントを配置してください。

```bash
# サンプル
watch/
├── 提案書/
│   ├── A社向け提案書_2025.docx
│   └── B社向け提案書_2024.pptx
├── 報告書/
│   ├── 2025年1月_月次報告.docx
│   └── 2025年2月_月次報告.docx
└── 見積書/
    └── 見積書_テンプレート.xlsx
```

ファイルを配置すると自動的にインデクシングされます。

---

## プロジェクト構成

```
051_AI文書検索作成Proj/
├── docker-compose.yml    # 全コンポーネント起動定義
├── .env.example          # 環境変数テンプレート
├── app/
│   ├── api/              # FastAPI バックエンド
│   └── frontend/         # Next.js フロントエンド
├── crawler/              # ファイル監視クローラー
├── watch/                # 監視対象ドキュメントを配置するフォルダ
├── templates/            # 文書テンプレート（Word/Excel/PPT）
├── step2/                # Phase3〜 DB連携モジュール
└── docs/                 # プロジェクト資料
    ├── プロジェクト概要資料_書き起こし.md
    └── 開発計画書.md
```

---

## 開発フェーズ

| フェーズ | 内容 | ステータス |
|---------|------|---------|
| **Phase 0** | 環境構築・Docker基盤 | 🔨 進行中 |
| **Phase 1** | RAG基盤 + チャットUI | ⏳ 待機中 |
| **Phase 2** | Step1完成（音声・文書生成・外部検索） | ⏳ 待機中 |
| **Phase 3** | Step2設計・NL2SQL | ⏳ 待機中 |
| **Phase 4** | Step2 DB連携・最終統合 | ⏳ 待機中 |

---

## 停止・リセット

```bash
# 停止
docker compose down

# データも含めてリセット（注意：インデクスが消えます）
docker compose down -v
```

---

## ライセンス・著作権

Confidential — Copyright 2026 SuccessKnowledge LLC
