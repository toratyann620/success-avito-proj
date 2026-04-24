"""
音声認識 APIルーター
Whisper（ローカル）で音声ファイルをテキスト変換する
"""
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel
from loguru import logger
import tempfile
import os

router = APIRouter()


class VoiceResponse(BaseModel):
    text: str
    language: str


@router.post("/transcribe", response_model=VoiceResponse)
async def transcribe(audio: UploadFile = File(...)):
    """音声ファイルをテキストに変換する（Whisper）"""
    logger.info(f"音声認識: {audio.filename}")

    # 一時ファイルに保存
    suffix = os.path.splitext(audio.filename)[1] or ".wav"
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        content = await audio.read()
        tmp.write(content)
        tmp_path = tmp.name

    try:
        import whisper
        model = whisper.load_model("base")  # "base" / "small" / "medium" / "large-v3"
        result = model.transcribe(tmp_path, language="ja")
        text = result["text"].strip()
        logger.info(f"音声認識結果: {text[:50]}...")
        return VoiceResponse(text=text, language="ja")
    except ImportError:
        raise HTTPException(
            status_code=503,
            detail="Whisperがインストールされていません。requirements.txtを確認してください。"
        )
    except Exception as e:
        logger.error(f"音声認識エラー: {e}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        os.unlink(tmp_path)
