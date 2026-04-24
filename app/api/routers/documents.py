"""
文書生成 APIルーター
Word / Excel / PowerPoint ファイルを生成して返す
"""
from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse
from pydantic import BaseModel
from loguru import logger
import tempfile
import os
from pathlib import Path

from services.rag_engine import rag_engine

router = APIRouter()


class DocumentRequest(BaseModel):
    doc_type: str       # "excel" / "word" / "pptx"
    requirements: str   # 作成要件（自然言語）
    search_query: str   # 参照資料の検索キーワード
    template: str = "default"


@router.post("/generate")
async def generate_document(request: DocumentRequest):
    """文書ドラフトを生成してダウンロードさせる"""
    logger.info(f"文書生成リクエスト: type={request.doc_type}")

    # まずRAGでドラフトコンテンツを生成
    rag_result = await rag_engine.generate_document_draft(
        requirements=request.requirements,
        doc_type=request.doc_type,
        query=request.search_query,
    )

    draft_content = rag_result.answer

    try:
        if request.doc_type == "word":
            file_path = _generate_word(draft_content, request.requirements)
            media_type = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            filename = "draft_report.docx"

        elif request.doc_type == "excel":
            file_path = _generate_excel(draft_content, request.requirements)
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = "draft_sheet.xlsx"

        elif request.doc_type == "pptx":
            file_path = _generate_pptx(draft_content, request.requirements)
            media_type = "application/vnd.openxmlformats-officedocument.presentationml.presentation"
            filename = "draft_presentation.pptx"

        else:
            raise HTTPException(status_code=400, detail=f"未対応のdoc_type: {request.doc_type}")

        return FileResponse(
            path=file_path,
            media_type=media_type,
            filename=filename,
        )
    except Exception as e:
        logger.error(f"文書生成エラー: {e}")
        raise HTTPException(status_code=500, detail=str(e))


def _generate_word(content: str, title: str) -> str:
    """Word文書を生成してパスを返す"""
    from docx import Document
    from docx.shared import Pt
    from docx.enum.text import WD_ALIGN_PARAGRAPH

    doc = Document()

    # タイトル
    heading = doc.add_heading(title[:50], level=1)
    heading.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # 本文（マークダウンを簡易変換）
    for line in content.split("\n"):
        line = line.strip()
        if not line:
            doc.add_paragraph()
        elif line.startswith("## "):
            doc.add_heading(line[3:], level=2)
        elif line.startswith("### "):
            doc.add_heading(line[4:], level=3)
        elif line.startswith("- ") or line.startswith("* "):
            p = doc.add_paragraph(line[2:], style="List Bullet")
        else:
            doc.add_paragraph(line)

    # 一時ファイルに保存
    tmp = tempfile.NamedTemporaryFile(suffix=".docx", delete=False)
    doc.save(tmp.name)
    return tmp.name


def _generate_excel(content: str, title: str) -> str:
    """Excel文書を生成してパスを返す"""
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment

    wb = Workbook()
    ws = wb.active
    ws.title = "AIドラフト"

    # ヘッダー
    ws["A1"] = title[:50]
    ws["A1"].font = Font(bold=True, size=14)
    ws["A1"].alignment = Alignment(horizontal="center")
    ws.merge_cells("A1:D1")

    # コンテンツを行に分割して配置
    row = 3
    for line in content.split("\n"):
        line = line.strip()
        if line:
            ws.cell(row=row, column=1, value=line)
            row += 1

    # 列幅調整
    ws.column_dimensions["A"].width = 80

    tmp = tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False)
    wb.save(tmp.name)
    return tmp.name


def _generate_pptx(content: str, title: str) -> str:
    """PowerPoint文書を生成してパスを返す"""
    from pptx import Presentation
    from pptx.util import Inches, Pt

    prs = Presentation()
    slide_layout = prs.slide_layouts[1]  # タイトルとコンテンツ

    # タイトルスライド
    slide = prs.slides.add_slide(prs.slide_layouts[0])
    slide.shapes.title.text = title[:50]
    slide.placeholders[1].text = "AI生成ドラフト"

    # コンテンツをスライドに分割（見出しで分割）
    current_title = "概要"
    current_content = []

    for line in content.split("\n"):
        line = line.strip()
        if line.startswith("## ") or line.startswith("### "):
            # 前のスライドを保存
            if current_content:
                _add_pptx_slide(prs, slide_layout, current_title, current_content)
            current_title = line.lstrip("# ").strip()
            current_content = []
        elif line:
            current_content.append(line)

    # 最後のスライド
    if current_content:
        _add_pptx_slide(prs, slide_layout, current_title, current_content)

    tmp = tempfile.NamedTemporaryFile(suffix=".pptx", delete=False)
    prs.save(tmp.name)
    return tmp.name


def _add_pptx_slide(prs, layout, title: str, content: list[str]):
    """PowerPointにスライドを追加するヘルパー"""
    slide = prs.slides.add_slide(layout)
    slide.shapes.title.text = title[:50]
    tf = slide.placeholders[1].text_frame
    tf.text = "\n".join(content[:10])  # 最大10行
