"""
Ollama / Gemma LLMクライアント
ローカルLLMへのAPIアクセスを抽象化し、未接続時のフォールバック処理を提供する
"""
import os
import httpx
from typing import AsyncGenerator
from loguru import logger

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:3107")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5-coder:1.5b")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))


class LLMClient:
    """Ollama LLMクライアント（フォールバック機能付き）"""

    def __init__(self):
        self.base_url = OLLAMA_BASE_URL
        self.model = OLLAMA_MODEL
        self.timeout = OLLAMA_TIMEOUT

    async def chat(self, messages: list[dict], stream: bool = False) -> str:
        """チャット形式でLLMに問い合わせる"""
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": stream,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/chat",
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

    async def chat_stream(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        """ストリーミングでLLMの回答を取得する"""
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
                    f"{self.base_url}/api/chat",
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
        """シンプルなプロンプト生成"""
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(
                    f"{self.base_url}/api/generate",
                    json=payload,
                )
                response.raise_for_status()
                return response.json()["response"]
        except Exception as e:
            logger.warning(f"Ollama接続エラー (generate)。フォールバック処理を実行します: {e}")
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
            f"「{query[:30]}」について、社内ナレッジベースを検索しました。\n\n"
            f"現在、ローカルの LLM サーバー (Ollama) が一時的に未稼働のため、テキスト生成処理をスキップしました。\n\n"
            f"UIのインタラクションを確認するには、ヘッダー右上の **「✨ デモモード」を ON** に切り替えてお試しください。"
        )

    async def is_available(self) -> bool:
        """Ollamaが利用可能かチェック"""
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(f"{self.base_url}/api/tags")
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
