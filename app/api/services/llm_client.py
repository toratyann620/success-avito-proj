"""
Ollama / Gemma3:12b LLMクライアント
ローカルLLMへのAPIアクセスを抽象化する
"""
import os
import httpx
from typing import AsyncGenerator
from loguru import logger

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://ollama:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "gemma3:12b")
OLLAMA_TIMEOUT = int(os.getenv("OLLAMA_TIMEOUT", "120"))


class LLMClient:
    """Ollama LLMクライアント"""

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
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/chat",
                json=payload,
            )
            response.raise_for_status()
            data = response.json()
            return data["message"]["content"]

    async def chat_stream(self, messages: list[dict]) -> AsyncGenerator[str, None]:
        """ストリーミングでLLMの回答を取得する"""
        import json
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
        }
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

    async def generate(self, prompt: str) -> str:
        """シンプルなプロンプト生成"""
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
        }
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.post(
                f"{self.base_url}/api/generate",
                json=payload,
            )
            response.raise_for_status()
            return response.json()["response"]

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
