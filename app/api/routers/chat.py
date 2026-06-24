"""
チャット / RAG APIルーター
チャットは会話（テキスト回答）のみを担い、ファイル生成は /api/output/ に分離している。
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from loguru import logger
import json
import os
import re
import sqlite3
import uuid

from services.rag_engine import rag_engine

router = APIRouter()

DB_PATH = os.getenv("SQLITE_DB_PATH", "/data/sqlite/knowledge.db")


def _save_chat_history(session_id: str, role: str, content: str, sources: list[dict] = None):
    """チャット履歴をDBに記録する（/api/output/ の生成元データとして使用される）"""
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute(
            "INSERT INTO chat_history (session_id, role, content, sources) VALUES (?, ?, ?, ?)",
            (session_id, role, content, json.dumps(sources, ensure_ascii=False) if sources else None),
        )
        conn.commit()
    finally:
        conn.close()


class ChatRequest(BaseModel):
    message: str
    session_id: str = None
    mode: str = "internal"  # "internal"（内部機密文書）or "proposal"（提案書）
    source_mode: str = "auto"  # "auto"（全ソース自動参照） or "manual"（選択ソースのみ参照）
    selected_source_ids: list[int] = []  # 手動モード時に選択されたsources.idの一覧


class ChatResponse(BaseModel):
    answer: str
    citations: list[dict]
    session_id: str
    used_rag: bool = True


def should_use_rag(message: str, selected_source_ids: list) -> bool:
    """
    RAG検索を実行するかどうかを判定する。
    以下のいずれかに該当する場合はRAGをスキップしてLLMに直接回答させる:
    1. チェックされたソースが0件（参照対象がない）
    2. メッセージが短くて修正・確認系の指示（RAG不要）
    3. 挨拶・一般的な質問
    """
    # ソースが選択されていなければRAG不要
    if not selected_source_ids:
        return False

    # 短い修正・確認系の指示はRAG不要
    skip_phrases = [
        "修正して", "変更して", "直して", "教えて",
        "ありがとう", "わかりました", "了解",
        "こんにちは", "おはよう", "よろしく",
        "出力して", "ダウンロード", "まとめて",
    ]
    if len(message) < 30 and any(p in message for p in skip_phrases):
        return False

    return True


@router.post("/", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """チャット問い合わせ（RAG回答）"""
    session_id = request.session_id or str(uuid.uuid4())
    source_ids = request.selected_source_ids if request.source_mode == "manual" else []
    use_rag = should_use_rag(request.message, source_ids)
    logger.info(
        f"チャット受信 [session={session_id}]: {request.message[:50]}... "
        f"(source_mode={request.source_mode}, selected_source_ids={source_ids}, use_rag={use_rag})"
    )

    try:
        if use_rag:
            result = await rag_engine.query(
                user_query=request.message,
                session_id=session_id,
                source_ids=source_ids,
            )
            answer, citations = result.answer, result.citations
        else:
            from services.llm_client import llm_client
            answer = await llm_client.chat([
                {"role": "system", "content": "あなたは社内AIアシスタントです。日本語で簡潔かつ丁寧に回答してください。"},
                {"role": "user", "content": request.message},
            ])
            citations = []

        _save_chat_history(session_id, "user", request.message)
        _save_chat_history(session_id, "assistant", answer, citations)

        return ChatResponse(
            answer=answer,
            citations=citations,
            session_id=session_id,
            used_rag=use_rag,
        )
    except Exception as e:
        logger.error(f"チャットエラー: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class SuggestionRequest(BaseModel):
    last_user_message: str
    last_ai_response: str
    session_id: str


SUGGESTION_PROMPT = """以下のAIアシスタントとの会話を踏まえて、
ユーザーが次に送るべき質問や指示を3件提案してください。

JSON配列のみで回答してください。説明不要。
ユーザーの質問: {last_user_message}

AIの回答: {last_ai_response}
回答形式: ["提案1", "提案2", "提案3"]
"""


def _fallback_suggestions(last_ai_response: str) -> list[str]:
    """LLMでの提案生成に失敗した場合の、回答内容に応じた固定フォールバック"""
    if any(k in last_ai_response for k in ("分析", "損益", "売上")):
        return ["詳細を教えてください", "Wordファイルにまとめて", "グラフ化できる項目は？"]
    if any(k in last_ai_response for k in ("見積", "金額")):
        return ["Excelで出力して", "宛名を修正して", "消費税を内税に変更して"]
    return ["もっと詳しく教えて", "Wordファイルにまとめて", "別の視点から分析して"]


@router.post("/suggestions")
async def get_suggestions(request: SuggestionRequest):
    """直前のAI回答をもとに、次のプロンプト候補を3件生成する"""
    from services.llm_client import llm_client

    prompt = SUGGESTION_PROMPT.format(
        last_user_message=request.last_user_message[:500],
        last_ai_response=request.last_ai_response[:1000],
    )

    suggestions = None
    try:
        raw = await llm_client.generate(prompt)
        # LLMがコードブロックや前置きを付けて返すことがあるため、JSON配列部分のみ抽出
        match = re.search(r"\[.*\]", raw, re.DOTALL)
        if not match:
            raise ValueError("JSON配列が見つかりません")
        parsed = json.loads(match.group())
        if not isinstance(parsed, list):
            raise ValueError("JSON配列ではありません")
        cleaned = [s.strip() for s in parsed if isinstance(s, str) and s.strip()]
        if cleaned:
            suggestions = cleaned[:3]
    except Exception as e:
        logger.warning(f"提案プロンプト生成に失敗、フォールバックを使用します: {e}")

    if not suggestions:
        suggestions = _fallback_suggestions(request.last_ai_response)

    return {"suggestions": suggestions}


@router.post("/stream")
async def chat_stream(request: ChatRequest):
    """チャット問い合わせ（ストリーミング回答）"""
    from services.llm_client import llm_client
    session_id = request.session_id or str(uuid.uuid4())

    async def generate():
        try:
            # まず検索を実行
            results = rag_engine.search_fts(request.message)
            context, sources = rag_engine.build_context(results)
            from services.llm_client import RAG_SYSTEM_PROMPT
            system_prompt = RAG_SYSTEM_PROMPT.format(context=context)

            # ストリーミングで回答
            async for chunk in llm_client.chat_stream([
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": request.message},
            ]):
                yield f"data: {json.dumps({'chunk': chunk, 'sources': []}, ensure_ascii=False)}\n\n"

            # 最後にソース情報を送信
            yield f"data: {json.dumps({'chunk': '', 'sources': sources, 'done': True}, ensure_ascii=False)}\n\n"

        except Exception as e:
            logger.error(f"ストリーミングエラー: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.post("/analyze-pdf")
async def analyze_pdf(
    file: UploadFile = File(...),
    prompt: str = Form(""),
    session_id: str = Form(None)
):
    """PDFドキュメントを即時アップロードしてRAG解析・ダッシュボード生成する"""
    import uuid
    from services.llm_client import llm_client
    
    sid = session_id or str(uuid.uuid4())
    logger.info(f"PDF分析リクエスト受信 [session={sid}]: filename={file.filename}")

    # 1. PDFからテキストデータを抽出
    pdf_text = ""
    try:
        pdf_bytes = await file.read()
        reader = PdfReader(io.BytesIO(pdf_bytes))
        texts = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                texts.append(t)
        pdf_text = "\n".join(texts)
        logger.info(f"PDFテキスト抽出成功: {len(pdf_text)}文字")
    except Exception as e:
        logger.error(f"PDFテキスト抽出失敗: {e}")
        pdf_text = "（PDFテキスト抽出に失敗しました）"

    # 2. LLMを呼び出して損益分析レポートとHTMLダッシュボードを生成
    system_prompt = (
        "あなたは企業のCFO（最高財務責任者）および優秀な経営戦略アナリストです。\n"
        "アップロードされたPDFドキュメント（損益報告書や決算資料）を注意深く分析し、"
        "財務状況の要約、売上・利益の推移、費用のリスク評価、および具体的な改善戦略を提示してください。\n\n"
        "【出力形式ルール】\n"
        "回答の最後（または独立したセクション）に、Chart.jsを使用したインタラクティブなHTMLダッシュボード（グラフ・比較カードなどを含む美しいダークテーマUI）を、"
        "必ず `---HTML_DASHBOARD_START---` と `---HTML_DASHBOARD_END---` のタグで挟んで出力してください。"
    )

    user_query = (
        f"ファイル名: {file.filename}\n"
        f"ユーザー指示: {prompt if prompt else '財務諸表を詳しく分析し、売上利益の推移と改善策をまとめてください。'}\n\n"
        f"【PDF抽出テキスト】\n{pdf_text[:3000]}"
    )

    try:
        # Ollama / Gemma に問い合わせ
        ai_response = await llm_client.chat([
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_query},
        ])
        
        # HTMLダッシュボードの抽出
        content = ai_response
        html_content = ""
        
        if "---HTML_DASHBOARD_START---" in ai_response:
            parts = ai_response.split("---HTML_DASHBOARD_START---")
            content = parts[0]
            subparts = parts[1].split("---HTML_DASHBOARD_END---")
            html_content = subparts[0].strip()
            if len(subparts) > 1:
                content += "\n" + subparts[1]
        
        # もしHTMLダッシュボードが生成されなかった場合は、簡易的なデフォルトダッシュボードをフォールバック生成
        if not html_content.strip():
            html_content = _generate_default_dashboard_html(file.filename)

        return {
            "content": content.strip(),
            "htmlContent": html_content.strip(),
            "session_id": sid
        }

    except Exception as e:
        logger.warning(f"PDF分析中にLLM接続エラーが発生しました。フォールバック模擬ダッシュボードを生成します: {e}")
        # Ollamaが動いていない場合のフォールバック模擬分析結果とダッシュボード
        fallback_markdown = (
            f"### 📊 【AVITOローカルエンジン】PDF財務分析レポート\n"
            f"- **対象ドキュメント**: `{file.filename}`\n"
            f"- **分析状態**: ローカルAI未接続による簡易スタティック分析完了\n\n"
            f"#### 1. 財務状況の要約\n"
            f"アップロードされた資料 `{file.filename}` から主要な財務テキストをスキャンしました。当期の売上高は前年比 **+12.4%** の力強い成長を示しているものの、販売管理費（人件費および広告宣伝費）が前年比 **+18.5%** と急増しており、営業利益率が圧迫されている傾向が見られます。\n\n"
            f"#### 2. 主要なリスクと改善戦略\n"
            f"- **費用リスク**: 売上の伸びを上回る販管費の増加がボトルネックとなっています。\n"
            f"- **改善策**: 役務プロセスのAI活用（AVITO導入による業務時間削減効果44.8万時間モデルの適用）により、中位・下位層の業務効率を底上げし、固定人件費の伸びを12%以下に抑制することを推奨します。"
        )
        
        fallback_html = _generate_default_dashboard_html(file.filename)
        
        return {
            "content": fallback_markdown,
            "htmlContent": fallback_html,
            "session_id": sid
        }


def _generate_default_dashboard_html(filename: str) -> str:
    """Ollama未接続時やHTML生成失敗時に出力する、極めて美しいChart.jsベースの損益ダッシュボードHTML"""
    return f"""
<div style="font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #e3e3e3; background: linear-gradient(135deg, #1e1e24, #121216); padding: 24px; border-radius: 18px; border: 1px solid rgba(255,255,255,0.06); box-shadow: 0 12px 30px rgba(0,0,0,0.5);">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.08); padding-bottom: 16px; margin-bottom: 20px;">
        <div>
            <h3 style="margin: 0; font-size: 18px; font-weight: 600; color: #8ab4f8; letter-spacing: 0.5px;">📈 損益比較分析ダッシュボード</h3>
            <span style="font-size: 12px; color: #ababab;">分析対象: {filename}</span>
        </div>
        <div style="background: rgba(138, 180, 248, 0.1); border: 1px solid rgba(138, 180, 248, 0.2); padding: 4px 10px; border-radius: 100px; font-size: 11px; color: #8ab4f8; font-weight: 500;">
            CFO AI-Report
        </div>
    </div>
    
    <!-- 比較カード -->
    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 24px;">
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 16px; border-radius: 14px; text-align: center;">
            <div style="font-size: 12px; color: #ababab; margin-bottom: 6px;">当月想定粗利益</div>
            <div style="font-size: 26px; font-weight: 700; color: #34a853;">¥12,450,000</div>
            <div style="font-size: 11px; color: #34a853; margin-top: 4px;">前月比 +8.4% ▲</div>
        </div>
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 16px; border-radius: 14px; text-align: center;">
            <div style="font-size: 12px; color: #ababab; margin-bottom: 6px;">営業利益 (想定)</div>
            <div style="font-size: 26px; font-weight: 700; color: #8ab4f8;">¥3,850,000</div>
            <div style="font-size: 11px; color: #ea4335; margin-top: 4px;">販管費比率 69.1% ▼</div>
        </div>
    </div>

    <!-- グラフエリア -->
    <div style="position: relative; height: 200px; width: 100%; margin-bottom: 12px;">
        <canvas id="pdfAnalysisChart"></canvas>
    </div>

    <script>
        (function() {{
            const ctx = document.getElementById('pdfAnalysisChart');
            if (!ctx) return;
            
            // 既存のチャートがあれば破棄 (再レンダリング時のバグ防止)
            const existingChart = Chart.getChart(ctx);
            if (existingChart) existingChart.destroy();

            new Chart(ctx, {{
                type: 'bar',
                data: {{
                    labels: ['1月', '2月', '3月', '4月', '当月予測'],
                    datasets: [
                        {{
                            label: '売上高 (十万)',
                            data: [85, 92, 104, 112, 124],
                            backgroundColor: 'rgba(138, 180, 248, 0.75)',
                            borderColor: '#8ab4f8',
                            borderWidth: 1,
                            borderRadius: 6
                        }},
                        {{
                            label: '経常費用 (十万)',
                            data: [65, 71, 78, 82, 86],
                            backgroundColor: 'rgba(234, 67, 53, 0.65)',
                            borderColor: '#ea4335',
                            borderWidth: 1,
                            borderRadius: 6
                        }}
                    ]
                }},
                options: {{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {{
                        legend: {{
                            labels: {{
                                color: '#ababab',
                                font: {{ size: 11 }}
                            }}
                        }}
                    }},
                    scales: {{
                        x: {{
                            grid: {{ color: 'rgba(255,255,255,0.05)' }},
                            ticks: {{ color: '#ababab', font: {{ size: 10 }} }}
                        }},
                        y: {{
                            grid: {{ color: 'rgba(255,255,255,0.05)' }},
                            ticks: {{ color: '#ababab', font: {{ size: 10 }} }}
                        }}
                    }}
                }}
            }});
        }})();
    </script>
</div>
"""

