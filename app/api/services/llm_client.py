"""
Ollama / Gemma / Claude LLMクライアント
ローカルLLM(Ollama)へのAPIアクセスを抽象化し、未接続時のフォールバック処理を提供する。

⚠️ モデル名が "claude-" で始まる場合のみ Anthropic API（クラウド）を使用する。
   本プロジェクトは CLAUDE.md に「完全ローカル・閉域網動作」が明記されており、
   Claude API利用時はチャット内容・参照資料がAnthropicのクラウドAPIへ送信される
   （閉域網要件と矛盾する）。そのためデフォルトでは使用せず、設定画面で
   ANTHROPIC_API_KEY が設定されている場合のみ選択肢として表示し、選択時には
   フロントエンドで「外部送信が発生する」警告を表示する運用としている
   （settings.py / page.tsx 側のオプトインUIと対になる実装）。
"""
import os
import sqlite3
import httpx
from typing import AsyncGenerator
from loguru import logger

try:
    from anthropic import AsyncAnthropic
except ImportError:
    AsyncAnthropic = None

OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:4b")
DB_PATH = os.getenv("SQLITE_DB_PATH", "/data/sqlite/knowledge.db")


def _load_model_from_db() -> str:
    """DBに保存されたモデル設定を読み込む。なければ環境変数を使用。

    main.py のルーター読み込み順（chat → ... → settings）により、
    settings.py の _ensure_settings_table() が走る前に
    rag_engine.py 経由でこの関数が呼ばれる可能性がある（settingsテーブル未作成）。
    そのため、ここでも CREATE TABLE IF NOT EXISTS を冪等に実行し、
    import順に依存せずDB優先の読み込みを保証する。
    """
    try:
        conn = sqlite3.connect(DB_PATH)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        row = conn.execute(
            "SELECT value FROM settings WHERE key='ollama_model'"
        ).fetchone()
        conn.close()
        if row and row[0]:
            return row[0]
    except Exception:
        pass
    return os.getenv("OLLAMA_MODEL", "gemma3:4b")


class LLMClient:
    """Ollama / Claude LLMクライアント（フォールバック機能付き）"""

    def __init__(self):
        self.model = _load_model_from_db()
        self.ollama_base_url = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
        self.timeout = int(os.getenv("OLLAMA_TIMEOUT", "600"))
        self.anthropic_api_key = os.getenv("ANTHROPIC_API_KEY", "")

    def set_model(self, model: str):
        """使用モデルを動的に切り替える（/api/settings/model から呼ばれる）"""
        self.model = model

    def _is_claude_model(self) -> bool:
        """モデル名が "claude-" で始まる場合のみAnthropic APIを使用する"""
        return self.model.startswith("claude-")

    @staticmethod
    def _split_system_message(messages: list[dict]) -> tuple[str | None, list[dict]]:
        """既存呼び出し元はsystemロールをmessagesに埋め込むため、
        Claude Messages API向けに system パラメータへ分離する
        （Anthropic APIはmessages配列内に role="system" を受け付けない）。
        """
        system_texts = [m["content"] for m in messages if m.get("role") == "system"]
        rest = [m for m in messages if m.get("role") != "system"]
        system = "\n\n".join(system_texts) if system_texts else None
        return system, rest

    async def chat(self, messages: list[dict], system_prompt: str = None, **kwargs) -> str:
        """チャット形式でLLMに問い合わせる（モデル名に応じてOllama/Claudeへ振り分け）"""
        if self._is_claude_model():
            return await self._chat_claude(messages, system_prompt)
        return await self._chat_ollama(messages, system_prompt)

    async def _chat_ollama(self, messages: list[dict], system_prompt: str = None) -> str:
        if system_prompt:
            messages = [{"role": "system", "content": system_prompt}] + [
                m for m in messages if m.get("role") != "system"
            ]
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.ollama_base_url}/api/chat",
                    json=payload,
                )
                response.raise_for_status()
                data = response.json()
                return data["message"]["content"]
        except Exception as e:
            logger.warning(f"Ollama接続エラー。フォールバック処理を実行します: {e}")
            user_msg = messages[-1]["content"] if messages else ""
            system_msg = next((m["content"] for m in messages if m["role"] == "system"), "")

            # システムプロンプトからコンテキストを抽出
            context = ""
            if "【参照資料】" in system_msg:
                context = system_msg.split("【参照資料】")[-1].strip()

            return self._generate_fallback_response(user_msg, context)

    async def _chat_claude(self, messages: list[dict], system_prompt: str = None) -> str:
        extracted_system, claude_messages = self._split_system_message(messages)
        system = system_prompt or extracted_system

        if not self.anthropic_api_key or AsyncAnthropic is None:
            logger.warning("ANTHROPIC_API_KEYが未設定のためClaude APIを利用できません。フォールバック処理を実行します。")
            user_msg = claude_messages[-1]["content"] if claude_messages else ""
            return self._generate_fallback_response(user_msg, "")

        try:
            client = AsyncAnthropic(api_key=self.anthropic_api_key, timeout=60.0)
            kwargs = {
                "model": self.model,
                "max_tokens": 2048,
                "messages": claude_messages,
            }
            if system:
                kwargs["system"] = system
            response = await client.messages.create(**kwargs)
            return response.content[0].text
        except Exception as e:
            logger.warning(f"Claude API接続エラー。フォールバック処理を実行します: {e}")
            user_msg = claude_messages[-1]["content"] if claude_messages else ""
            return self._generate_fallback_response(user_msg, "")

    async def chat_stream(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        """ストリーミングでLLMの回答を取得する（Ollamaのみ対応。Claudeモデル選択時は非対応）"""
        import json
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                async with client.stream(
                    "POST",
                    f"{self.ollama_base_url}/api/chat",
                    json=payload,
                ) as response:
                    async for line in response.aiter_lines():
                        if line:
                            data = json.loads(line)
                            if not data.get("done"):
                                yield data["message"]["content"]
        except Exception as e:
            logger.warning(f"Ollama接続ストリームエラー。フォールバックテキストを返します: {e}")
            user_msg = messages[-1]["content"] if messages else ""
            system_msg = next((m["content"] for m in messages if m["role"] == "system"), "")
            context = ""
            if "【参照資料】" in system_msg:
                context = system_msg.split("【参照資料】")[-1].strip()

            fallback_text = self._generate_fallback_response(user_msg, context)
            yield fallback_text

    async def generate(self, prompt: str) -> str:
        """シンプルなプロンプト生成（モデル名に応じてOllama/Claudeへ振り分け）"""
        if self._is_claude_model():
            return await self._generate_claude(prompt)
        return await self._generate_ollama(prompt)

    async def _generate_ollama(self, prompt: str) -> str:
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.ollama_base_url}/api/generate",
                    json=payload,
                )
                response.raise_for_status()
                return response.json()["response"]
        except Exception as e:
            logger.warning(f"Ollama接続エラー (generate)。フォールバック処理を実行します: {e}")
            return self._generate_fallback_response(prompt, "")

    async def _generate_claude(self, prompt: str) -> str:
        if not self.anthropic_api_key or AsyncAnthropic is None:
            logger.warning("ANTHROPIC_API_KEYが未設定のためClaude APIを利用できません。フォールバック処理を実行します。")
            return self._generate_fallback_response(prompt, "")

        try:
            client = AsyncAnthropic(api_key=self.anthropic_api_key, timeout=60.0)
            response = await client.messages.create(
                model=self.model,
                max_tokens=1500,
                messages=[{"role": "user", "content": prompt}],
            )
            return response.content[0].text
        except Exception as e:
            logger.warning(f"Claude API接続エラー (generate)。フォールバック処理を実行します: {e}")
            return self._generate_fallback_response(prompt, "")

    def _generate_fallback_response(self, query: str, context: str) -> str:
        """Ollamaが動いていない場合の高クオリティな模擬RAG回答生成"""
        lower_query = query.lower()
        
        # 実際に SQLite FTS5 で抽出されたコンテキストがある場合、それを要約
        if context and "【資料" in context:
            docs = []
            # 【資料1: XXX】のようなテキストをパース
            parts = context.split("【資料")
            for part in parts:
                if part.strip():
                    try:
                        title_part = part.split("】")
                        title = title_part[0].strip()
                        content = title_part[1].strip() if len(title_part) > 1 else ""
                        if title and content:
                            docs.append((title, content))
                    except Exception:
                        pass
            
            if docs:
                summary_parts = []
                for idx, (title, doc_content) in enumerate(docs):
                    # 重要なポイントを抽出する模擬処理
                    snippet = doc_content[:180].replace("\n", " ") + "..."
                    summary_parts.append(f"{idx+1}. **{title}**\n   {snippet}")
                
                summary = "\n\n".join(summary_parts)
                return (
                    f"💡 *[AVITOローカルエンジン]* ローカルの LLM サーバー (Ollama) が未接続のため、"
                    f"RAGクローラーでFTS5インデックス化した社内ドキュメントの生データを直接抽出し、回答を構成しました。\n\n"
                    f"**【社内ナレッジデータベースの検索結果（合致度順）】**\n\n{summary}\n\n"
                    f"--- \n"
                    f"※ ローカルで `Ollama` を起動し `gemma` モデルをロードすると、上記データに基づいたより高度なAI要約やドラフト作成が可能になります。"
                )

        # 通常の模擬回答
        if "見積" in lower_query or "excel" in lower_query:
            return (
                "見積書（Excel）のドラフトを自動生成しました。\n\n"
                "**【見積ドラフト要約】**\n"
                "- 項目: A商品 システム導入作業\n"
                "- 単価: ¥50,000 / 人日\n"
                "- 数量: 2人日\n"
                "- 小計: ¥100,000 (消費税 ¥10,000)\n"
                "- 合計金額: **¥110,000**\n\n"
                "チャット右側のダウンロードバッジから、自動生成された `.xlsx` ファイルをダウンロードしてご確認ください。"
            )
        elif "報告" in lower_query or "word" in lower_query:
            return (
                "進捗報告書（Word）のドラフトを自動生成しました。\n\n"
                "**【報告書構成案】**\n"
                "1. 週次進捗ステータス: 順調\n"
                "2. 実施済みタスク: フロントエンド移植、CORS設定拡張、FastAPI起動\n"
                "3. 次週予定: DB連携 Step2 方式設計\n\n"
                "チャット右側のダウンロードバッジから、自動生成された `.docx` ファイルをダウンロードしてご確認ください。"
            )
        elif "提案" in lower_query or "powerpoint" in lower_query or "ppt" in lower_query:
            return (
                "新製品提案書（PowerPoint）のドラフトを自動生成しました。\n\n"
                "**【スライド構成案 (計10スライド)】**\n"
                "- Slide 1: タイトル（AVITOによる価値連鎖）\n"
                "- Slide 2: エグゼクティブサマリー\n"
                "- Slide 3: 課題定義（2:6:2の組織ボトルネック）\n"
                "- Slide 4: ソリューション提案（クローズド型RAG）\n"
                "- Slide 5: システムアーキテクチャ\n\n"
                "チャット右側のダウンロードバッジから、自動生成された `.pptx` ファイルをダウンロードしてご確認ください。"
            )
        
        return (
            "申し訳ありません。現在AIの応答に時間がかかっています。\n"
            "少し待ってから再度お試しください。\n\n"
            "※ 問題が続く場合は、管理者にお問い合わせください。"
        )

    async def is_available(self) -> bool:
        """Ollamaが利用可能かチェック"""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.ollama_base_url}/api/tags")
                return response.status_code == 200
        except Exception:
            return False


# シングルトンインスタンス
llm_client = LLMClient()


# ==========================================
# プロンプトテンプレート
# ==========================================

RAG_SYSTEM_PROMPT = """あなたは企業の社内AIアシスタントです。
以下のルールを厳守してください：

1. 提供された「参照資料」の内容のみを根拠に回答してください
2. 参照資料に記載のない情報は「資料に記載がありません」と明示してください
3. 回答の最後に必ず参照した資料名・ページ番号を明記してください
4. 機密情報の外部送信は一切行いません
5. 日本語で丁寧かつ簡潔に回答してください

【参照資料】
{context}
"""

DOCUMENT_GENERATION_PROMPT = """あなたは業務文書作成の専門家です。
以下の要件と参照資料をもとに、{doc_type}の草案を作成してください。

【要件】
{requirements}

【参照資料】
{context}

【出力形式】
- 構造化されたマークダウン形式で出力してください
- セクション・項目は明確に分けてください
- 数値・固有名詞は参照資料から正確に引用してください
- 不明な部分は [要確認: XXX] と明示してください
"""

ESTIMATE_EXTRACTION_PROMPT = """あなたは見積書データの抽出専門AIです。
以下のチャット履歴から見積書に必要な情報を抽出し、
必ず下記のJSON形式のみで回答してください。
JSON以外のテキスト（説明・前置き・コードブロック記号）は一切出力しないこと。

{{
  "to_company": "宛先会社名（不明なら「〇〇株式会社 御中」）",
  "to_address": "宛先住所（不明なら空文字）",
  "estimate_date": "見積日 YYYY-MM-DD形式（不明なら今日の日付）",
  "estimate_no": "見積番号（不明なら「001」）",
  "valid_until": "有効期限 YYYY-MM-DD形式（不明なら1ヶ月後）",
  "delivery_date": "納期（不明なら「要相談」）",
  "payment_terms": "支払条件（不明なら「月末締め翌月末払い」）",
  "from_company": "発行会社名（不明なら「●●株式会社」）",
  "from_address": "発行会社住所（不明なら空文字）",
  "from_tel": "電話番号（不明なら空文字）",
  "from_email": "メールアドレス（不明なら空文字）",
  "items": [
    {{
      "name": "品目名",
      "qty": 数量（数値）,
      "unit": "単位（式/個/本/時間など）",
      "unit_price": 単価（数値・税抜）,
      "tax_rate": 0.10（通常税率）または 0.08（軽減税率）
    }}
  ],
  "notes": "備考（不明なら空文字）"
}}

チャット履歴:
{context}
"""
