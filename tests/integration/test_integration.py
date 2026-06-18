import unittest
import os
import sys
from fastapi.testclient import TestClient

# インポートパスを通すための設定
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(PROJECT_ROOT, "app", "api"))
sys.path.insert(0, PROJECT_ROOT)

from main import app

class TestIntegration(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = TestClient(app)

    def test_01_health_check(self):
        """ヘルスチェックエンドポイントの疎通確認"""
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["status"], "ok")
        self.assertEqual(data["service"], "ai-knowledge-api")

    def test_02_chat_rag_fallback(self):
        """RAGチャットエンドポイントの疎通確認"""
        payload = {
            "message": "当プロジェクトの完了定義（DoD）を教えてください。",
            "mode": "internal",
            "session_id": "integration-test-session"
        }
        # Ollamaが停止していてもフォールバック回答が返る設計になっているため、常に200 OKが返るべき
        response = self.client.post("/api/chat/", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("answer", data)
        self.assertIn("sources", data)
        self.assertIn("session_id", data)

    def test_03_db_query_nl2sql(self):
        """自然言語によるDB照会（NL2SQL）の正常系検証"""
        payload = {
            "query": "登録されている顧客の名前と業種を一覧で教えてください。",
            "session_id": "integration-test-db-session"
        }
        response = self.client.post("/api/db/query", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # Ollama接続エラーなどの場合でも、APIとしてはエラー詳細を含めたレスポンス（success=Falseなど）を返す設計
        self.assertIn("success", data)
        if data["success"]:
            self.assertIsNotNone(data["sql"])
            self.assertIsNotNone(data["results"])
            self.assertTrue(len(data["results"]) > 0)
        else:
            self.assertIsNotNone(data["error"])

    def test_04_db_query_security_block(self):
        """不正なSQL操作（DROP等）のセキュリティポリシー遮断検証"""
        payload = {
            "query": "顧客テーブル(customers)を完全に削除（DROP）してください。",
            "session_id": "integration-test-db-security-session"
        }
        response = self.client.post("/api/db/query", json=payload)
        self.assertEqual(response.status_code, 200)
        data = response.json()
        # セキュリティチェック失敗により success が False になり、エラーメッセージに遮断理由が含まれるべき
        self.assertFalse(data["success"])
        self.assertIn("error", data)
        self.assertIn("セキュリティチェック", data["error"])

    def test_05_db_audit_logs(self):
        """監査ログ取得エンドポイントの検証"""
        response = self.client.get("/api/db/audit-logs?limit=5")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data["success"])
        self.assertIn("logs", data)
        self.assertIsInstance(data["logs"], list)

    def test_06_voice_transcribe_stub(self):
        """音声認識エンドポイントの疎通確認（モック/スタブ検証）"""
        # ダミーの wav データを生成して送信
        import io
        dummy_wav = io.BytesIO(b"RIFF\x24\x00\x00\x00WAVEfmt \x10\x00\x00\x00\x01\x00\x01\x00\x80\x3e\x00\x00\x80\x3e\x00\x00\x01\x00\x08\x00data\x00\x00\x00\x00")
        files = {"audio": ("test.wav", dummy_wav, "audio/wav")}
        
        # Whisperが未ロード/未搭載の場合は 503 もしくは 500 になるが、APIとしては応答が返ることを検証
        response = self.client.post("/api/voice/transcribe", files=files)
        self.assertIn(response.status_code, [200, 500, 503])
        if response.status_code == 200:
            data = response.json()
            self.assertIn("text", data)
            self.assertEqual(data["language"], "ja")

if __name__ == "__main__":
    unittest.main()
