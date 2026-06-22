"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileText, Lock, ChevronRight, FileUp,
  Copy, Check, ThumbsUp, ThumbsDown, NotebookPen,
} from "lucide-react";
import type { Message, BulletItem, TableData } from "@/app/lib/mockData";

/* -------- Geniusロゴ SVG -------- */
export function GeniusLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none">
      <defs>
        <linearGradient id="gem-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="33%" stopColor="#9B59B6" />
          <stop offset="66%" stopColor="#EA4335" />
          <stop offset="100%" stopColor="#34A853" />
        </linearGradient>
      </defs>
      {/* 4弁の星型（Geniusのアイコン風） */}
      <path
        d="M14 2 C14 8.5 19.5 14 26 14 C19.5 14 14 19.5 14 26 C14 19.5 8.5 14 2 14 C8.5 14 14 8.5 14 2Z"
        fill="url(#gem-grad)"
      />
    </svg>
  );
}

/* -------- アップロードファイルバッジ -------- */
function FileBadge({ fileName }: { fileName: string }) {
  return (
    <div style={{
      display: "inline-flex", alignItems: "center", gap: 8,
      padding: "6px 12px", borderRadius: 10,
      background: "rgba(26,115,232,0.1)",
      border: "1px solid rgba(26,115,232,0.25)",
      marginBottom: 8,
    }}>
      <FileUp size={14} style={{ color: "var(--accent-blue)" }} />
      <span style={{ fontSize: 12, color: "var(--accent-blue)" }}>{fileName}</span>
    </div>
  );
}

/* -------- Claude生成HTMLダッシュボード -------- */
function HtmlDashboard({ html }: { html: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !html) return;

    // 既存コンテンツをクリア
    el.innerHTML = "";

    try {
      // DOMParser を使って安全に HTML を構築
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");

      // style要素を抽出して el に追加
      const styles = doc.querySelectorAll("style");
      styles.forEach((style) => {
        el.appendChild(style.cloneNode(true));
      });

      // scriptタグ以外のHTML要素を一時的なコンテナに入れる
      const docBody = doc.body.cloneNode(true) as HTMLElement;
      const inlineScripts: string[] = [];

      // すべてのscriptタグを検索
      const scripts = docBody.querySelectorAll("script");
      scripts.forEach((script) => {
        // CDNからの読み込み（src属性あり）は Chart.js 以外除外、インラインスクリプトの内容は保存
        if (!script.getAttribute("src")) {
          inlineScripts.push(script.textContent || "");
        }
        script.remove(); // HTML本文からは一旦削除
      });

      // styleタグも除外
      const docStyles = docBody.querySelectorAll("style");
      docStyles.forEach((style) => style.remove());

      // HTML本文を el に追加
      const wrapper = document.createElement("div");
      wrapper.innerHTML = docBody.innerHTML;
      el.appendChild(wrapper);

      // Chart.js CDNを動的に読み込み、完了後にinline scriptを実行
      const loadChartJs = () => {
        return new Promise<void>((resolve) => {
          if ((window as unknown as Record<string, unknown>).Chart) {
            resolve();
            return;
          }
          const s = document.createElement("script");
          s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
          s.onload = () => resolve();
          document.head.appendChild(s);
        });
      };

      loadChartJs().then(() => {
        // 保存したインラインスクリプトを順番に実行
        inlineScripts.forEach((scriptContent) => {
          if (scriptContent.trim()) {
            try {
              const hoistedScript = scriptContent.replace(
                /^([ \t]*)function\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/gm,
                (match, indent, name) => {
                  return `${indent}window.${name} = function(`;
                }
              );

              const s = document.createElement("script");
              s.textContent = `(function(){\n${hoistedScript}\n})();`;
              el.appendChild(s);
            } catch (e) {
              console.error("Dashboard script syntax error, skipped execution:", e);
            }
          }
        });
      });
    } catch (e) {
      console.error("Dashboard parsing error:", e);
      const wrapper = document.createElement("div");
      wrapper.innerHTML = html;
      el.appendChild(wrapper);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [html]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      style={{
        marginTop: 16,
        background: "rgba(0,0,0,0.03)",
        border: "1px solid rgba(0,0,0,0.08)",
        borderRadius: 16,
        padding: "20px 20px 16px",
        overflow: "hidden",
      }}
    >
      <div ref={containerRef} />
    </motion.div>
  );
}

/* -------- 箇条書きセクション -------- */
function BulletsContent({ data }: { data: BulletItem[] }) {
  return (
    <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 16 }}>
      {data.map((sec, si) => (
        <motion.div
          key={si}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 + si * 0.12 }}
          style={{
            padding: 16, borderRadius: 14,
            background: "rgba(0,0,0,0.04)",
            border: "1px solid rgba(0,0,0,0.07)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>{sec.icon}</span>
            <span style={{ fontWeight: 600, color: "var(--text-primary)", fontSize: 15 }}>{sec.label}</span>
          </div>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {sec.items.map((item, ii) => (
              <motion.li
                key={ii}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + si * 0.12 + ii * 0.07 }}
                style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}
              >
                <ChevronRight size={14} style={{ color: "var(--accent-blue)", flexShrink: 0, marginTop: 3 }} />
                {item}
              </motion.li>
            ))}
          </ul>
        </motion.div>
      ))}
    </div>
  );
}

/* -------- テーブル -------- */
function TableContent({ data }: { data: TableData }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(0,0,0,0.08)" }}>
        <table className="data-table">
          <thead>
            <tr>{data.headers.map((h, i) => <th key={i}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {data.rows.map((row, ri) => (
              <motion.tr
                key={ri}
                initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                transition={{ delay: 0.2 + ri * 0.08 }}
              >
                {row.map((cell, ci) => (
                  <td key={ci} style={{ color: ci === 0 ? "var(--text-secondary)" : "var(--text-primary)" }}>{cell}</td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: "var(--text-tertiary)", fontSize: 11, marginTop: 8 }}>{data.summary}</p>
    </div>
  );
}

/* -------- アクセス制限 -------- */
function RestrictedCard() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.97 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: 0.3 }}
      className="restricted-card"
    >
      <Lock size={18} style={{ color: "#ea4335", flexShrink: 0, marginTop: 2 }} />
      <div>
        <div style={{ color: "#f28b82", fontWeight: 600, fontSize: 14, marginBottom: 4 }}>アクセス制限</div>
        <div style={{ color: "var(--text-secondary)", fontSize: 14, lineHeight: 1.6 }}>
          お客様の権限では機密データへのアクセスは制限されています。<br />
          管理者に承認を依頼してください。
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
          style={{
            marginTop: 12, padding: "6px 16px", borderRadius: 100,
            background: "rgba(234,67,53,0.15)", color: "#f28b82",
            border: "1px solid rgba(234,67,53,0.25)", fontSize: 13,
            fontWeight: 500, cursor: "pointer",
          }}
        >
          承認申請を送る
        </motion.button>
      </div>
    </motion.div>
  );
}

/* -------- シンプルMarkdownレンダラー -------- */
function RenderText({ text }: { text: string }) {
  return (
    <span className="ai-message-text">
      {text.split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
        p.startsWith("**") && p.endsWith("**")
          ? <strong key={i}>{p.slice(2, -2)}</strong>
          : <span key={i}>{p}</span>
      )}
    </span>
  );
}

/* -------- 生成中インジケータ -------- */
export function GeneratingIndicator({ label }: { label?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      style={{ display: "flex", alignItems: "flex-start", gap: 16, padding: "12px 0" }}
    >
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
        >
          <GeniusLogo size={24} />
        </motion.div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 4, flex: 1 }}>
        {/* フェーズラベル */}
        <AnimatePresence mode="wait">
          {label && (
            <motion.div
              key={label}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.25 }}
              style={{ display: "flex", alignItems: "center", gap: 8 }}
            >
              <span style={{ fontSize: 13, color: "var(--accent-blue)" }}>{label}</span>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="generating-shimmer" />
        <div className="generating-shimmer" style={{ width: 80 }} />
        <div style={{ display: "flex", gap: 6, marginTop: 4 }}>
          <div className="dot-typing" />
          <div className="dot-typing" />
          <div className="dot-typing" />
        </div>
      </div>
    </motion.div>
  );
}

/* -------- 出典チップ -------- */
function CitationChips({ citations }: { citations: NonNullable<Message["citations"]> }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 12 }}>
      {citations.map((c, i) => (
        <span key={i} className="source-chip" title={c.snippet || ""}>
          <FileText size={11} /> {c.file_name || c.doc_id || "出典"}
        </span>
      ))}
    </div>
  );
}

/* -------- 次のプロンプト提案チップ -------- */
function getSuggestedPrompts(lastAiMessage: string): string[] {
  const msg = lastAiMessage;

  // 見積書関連
  if (msg.includes("見積") || msg.includes("単価") || msg.includes("金額")) {
    return [
      "宛名と有効期限を修正して",
      "この内容でExcelファイルを出力して",
      "消費税を内税に変更して",
    ];
  }

  // 管理資料・分析関連
  if (msg.includes("売上") || msg.includes("分析") || msg.includes("予測")) {
    return [
      "この内容をWordでまとめて",
      "グラフ化できる項目を教えて",
      "改善アクションを具体的に提案して",
    ];
  }

  // NL2SQL・DB照会関連
  if (msg.includes("SELECT") || msg.includes("集計") || msg.includes("顧客")) {
    return [
      "前月と比較してください",
      "この結果をExcelで出力して",
      "上位5件に絞り込んで",
    ];
  }

  // 提案書・報告書関連
  if (msg.includes("提案") || msg.includes("課題") || msg.includes("報告")) {
    return [
      "PowerPointスライドにまとめて",
      "要点を3行で要約して",
      "Wordファイルとして出力して",
    ];
  }

  // デフォルト
  return [
    "この内容を詳しく教えて",
    "Wordファイルにまとめて",
    "別の視点から分析して",
  ];
}

function SuggestionChips({ content, onSuggestClick }: { content: string; onSuggestClick: (text: string) => void }) {
  const prompts = getSuggestedPrompts(content);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 16 }}>
      {prompts.map((prompt, i) => (
        <button
          key={i}
          className="suggestion-chip"
          onClick={() => onSuggestClick(prompt)}
          style={{
            padding: "10px 16px",
            borderRadius: 20,
            fontSize: 13,
            background: "var(--bg-chip)",
            border: "1px solid var(--border-subtle)",
            color: "var(--text-primary)",
            cursor: "pointer",
            textAlign: "left",
            fontFamily: "inherit",
            transition: "background 0.15s ease",
            width: "fit-content",
            maxWidth: "100%",
          }}
        >
          {prompt}
        </button>
      ))}
    </div>
  );
}

/* -------- メッセージアクション（コピー・メモ保存・評価） -------- */
function MessageActions({
  message,
  onSaveMemo,
  onFeedback,
}: {
  message: Message;
  onSaveMemo?: (content: string) => void;
  onFeedback?: (id: string, value: "up" | "down") => void;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("コピーに失敗しました:", e);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 12 }}>
      <button className="msg-action-btn" onClick={() => onSaveMemo?.(message.content)} title="メモに保存">
        <NotebookPen size={14} /> メモに保存
      </button>
      <button className="msg-action-btn icon-only" onClick={handleCopy} title="コピー">
        {copied ? <Check size={14} /> : <Copy size={14} />}
      </button>
      <button
        className={`msg-action-btn icon-only${message.feedback === "up" ? " active" : ""}`}
        onClick={() => onFeedback?.(message.id, "up")}
        title="役に立った"
      >
        <ThumbsUp size={14} />
      </button>
      <button
        className={`msg-action-btn icon-only${message.feedback === "down" ? " active" : ""}`}
        onClick={() => onFeedback?.(message.id, "down")}
        title="役に立たなかった"
      >
        <ThumbsDown size={14} />
      </button>
    </div>
  );
}

/* -------- メッセージバブル -------- */
export function MessageBubble({
  message,
  isLatestAssistant,
  onSaveMemo,
  onFeedback,
  onSuggestClick,
}: {
  message: Message;
  isLatestAssistant?: boolean;
  onSaveMemo?: (content: string) => void;
  onFeedback?: (id: string, value: "up" | "down") => void;
  onSuggestClick?: (text: string) => void;
}) {
  if (message.role === "user") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20 }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          {message.attachedFileName && (
            <FileBadge fileName={message.attachedFileName} />
          )}
          <div className="user-message">{message.content}</div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      style={{ display: "flex", alignItems: "flex-start", gap: 16, marginBottom: 28 }}
    >
      {/* Geniusアイコン */}
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <GeniusLogo size={24} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* メインテキスト */}
        <div className="ai-message-text">
          {message.content.split("\n").map((line, i) =>
            line === ""
              ? <div key={i} style={{ height: 8 }} />
              : <p key={i} style={{ marginBottom: 4 }}><RenderText text={line} /></p>
          )}
        </div>

        {/* Claude生成HTMLダッシュボード */}
        {message.htmlContent && (
          <HtmlDashboard html={message.htmlContent} />
        )}

        {/* リッチコンテンツ */}
        {message.richContent?.type === "bullets" && (
          <BulletsContent data={message.richContent.data as BulletItem[]} />
        )}
        {message.richContent?.type === "table" && (
          <TableContent data={message.richContent.data as TableData} />
        )}

        {/* アクセス制限 */}
        {message.isRestricted && <RestrictedCard />}

        {/* RAG出典チップ（実データ） */}
        {message.citations && message.citations.length > 0 && (
          <CitationChips citations={message.citations} />
        )}

        {/* アクション行 */}
        {!message.isRestricted && (
          <MessageActions message={message} onSaveMemo={onSaveMemo} onFeedback={onFeedback} />
        )}

        {/* 次のプロンプト提案チップ（最新のAI応答のみ） */}
        {!message.isRestricted && isLatestAssistant && onSuggestClick && (
          <SuggestionChips content={message.content} onSuggestClick={onSuggestClick} />
        )}
      </div>
    </motion.div>
  );
}
