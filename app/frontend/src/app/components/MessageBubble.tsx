"use client";

import { useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  FileSpreadsheet, FileText, Presentation,
  Download, Lock, ChevronRight, BadgeCheck, FileUp,
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
      background: "rgba(138,180,248,0.1)",
      border: "1px solid rgba(138,180,248,0.25)",
      marginBottom: 8,
    }}>
      <FileUp size={14} style={{ color: "#8ab4f8" }} />
      <span style={{ fontSize: 12, color: "#8ab4f8" }}>{fileName}</span>
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
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 16,
        padding: "20px 20px 16px",
        overflow: "hidden",
      }}
    >
      <div ref={containerRef} />
    </motion.div>
  );
}

/* -------- ファイルチップ -------- */
function FileCard({ fileChip }: { fileChip: NonNullable<Message["fileChip"]> }) {
  if (!fileChip.type) return null;
  const cfg = {
    excel:       { icon: <FileSpreadsheet size={22} />, color: "#34a853", bg: "rgba(52,168,83,0.12)",  border: "rgba(52,168,83,0.3)",  label: "Excel" },
    word:        { icon: <FileText size={22} />,         color: "#4285f4", bg: "rgba(66,133,244,0.12)", border: "rgba(66,133,244,0.3)", label: "Word"  },
    powerpoint:  { icon: <Presentation size={22} />,     color: "#ea4335", bg: "rgba(234,67,53,0.12)",  border: "rgba(234,67,53,0.3)",  label: "PowerPoint" },
  };
  const c = cfg[fileChip.type];
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.6 }}
      className="file-card"
      style={{ background: c.bg, border: `1px solid ${c.border}` }}
    >
      <div style={{ color: c.color }}>{c.icon}</div>
      <div>
        <div style={{ color: "#e3e3e3", fontWeight: 500, fontSize: 14 }}>{fileChip.filename}</div>
        <div style={{ color: "#ababab", fontSize: 12, marginTop: 2 }}>{c.label} · {fileChip.size} · 生成完了</div>
      </div>
      <motion.a
        href={fileChip.downloadUrl}
        download
        whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
        style={{
          display: "flex", alignItems: "center", gap: 4,
          marginLeft: "auto", padding: "6px 14px", borderRadius: 100,
          background: c.color, color: "white", border: "none",
          fontSize: 12, fontWeight: 600, cursor: "pointer",
          textDecoration: "none",
        }}
      >
        <Download size={13} /> ダウンロード
      </motion.a>
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
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.07)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 18 }}>{sec.icon}</span>
            <span style={{ fontWeight: 600, color: "#e3e3e3", fontSize: 15 }}>{sec.label}</span>
          </div>
          <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
            {sec.items.map((item, ii) => (
              <motion.li
                key={ii}
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.3 + si * 0.12 + ii * 0.07 }}
                style={{ display: "flex", alignItems: "flex-start", gap: 8, color: "#c8c8c8", fontSize: 14, lineHeight: 1.6 }}
              >
                <ChevronRight size={14} style={{ color: "#8ab4f8", flexShrink: 0, marginTop: 3 }} />
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
      <div style={{ borderRadius: 14, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
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
                  <td key={ci} style={{ color: ci === 0 ? "#ababab" : "#e3e3e3" }}>{cell}</td>
                ))}
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <p style={{ color: "#6e6e6e", fontSize: 11, marginTop: 8 }}>{data.summary}</p>
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
        <div style={{ color: "#ababab", fontSize: 14, lineHeight: 1.6 }}>
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
              <span style={{ fontSize: 13, color: "#8ab4f8" }}>{label}</span>
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

/* -------- メッセージバブル -------- */
export function MessageBubble({ message }: { message: Message }) {
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

        {/* ファイルカード */}
        {message.fileChip && <FileCard fileChip={message.fileChip} />}

        {/* RAG引用チップ */}
        {!message.isRestricted && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12 }}
          >
            <BadgeCheck size={13} style={{ color: "#8ab4f8" }} />
            <span style={{ color: "#6e6e6e", fontSize: 12 }}>RAG検索完了</span>
            <span className="source-chip">社内DB</span>
            <span className="source-chip">847件参照</span>
          </motion.div>
        )}
      </div>
    </motion.div>
  );
}
