"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Mic, Paperclip, Send, Shield, User, X,
  Search, NotebookPen, StickyNote, FileText, FileSpreadsheet,
  Presentation, FileType, BarChart3, Map as MapIcon, ClipboardList,
  CircleHelp, TrendingUp, Table2, Download,
} from "lucide-react";
import type { Message, UserRole, Source, OutputFile } from "@/app/lib/mockData";
import { getMockResponse, quickPrompts, THINKING_PHASES } from "@/app/lib/mockData";
import { MessageBubble, GeneratingIndicator, GeniusLogo } from "@/app/components/MessageBubble";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type ReferenceMode = "auto" | "manual";
type StudioTab = "studio" | "memo";
type MemoDraft = { id: string; title: string; content: string };

/* ============================
   権限トグル
   ============================ */
function RoleToggle({ role, onToggle }: { role: UserRole; onToggle: () => void }) {
  const isAdmin = role === "admin";
  return (
    <div
      onClick={onToggle}
      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 100,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        fontSize: 13, color: "#ababab",
      }}>
        {isAdmin ? <Shield size={13} style={{ color: "#fbbf24" }} /> : <User size={13} />}
        <span>{isAdmin ? "管理者" : "一般ユーザー"}</span>
      </div>

      <div
        className="toggle-track"
        style={{ background: isAdmin ? "linear-gradient(135deg,#f59e0b,#ef4444)" : "linear-gradient(135deg,#10b981,#3b82f6)", pointerEvents: "none" }}
      >
        <motion.div
          className="toggle-thumb"
          animate={{ left: isAdmin ? "calc(100% - 23px)" : "3px" }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </div>

      <span className={isAdmin ? "badge-admin" : "badge-user"}>
        {isAdmin ? "ADMIN" : "USER"}
      </span>
    </div>
  );
}

/* ============================
   デモモードトグル
   ============================ */
function DemoToggle({ demoMode, onToggle }: { demoMode: boolean; onToggle: () => void }) {
  return (
    <div
      onClick={onToggle}
      style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
    >
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "4px 10px", borderRadius: 100,
        background: "rgba(255,255,255,0.06)",
        border: "1px solid rgba(255,255,255,0.1)",
        fontSize: 13, color: "#ababab",
      }}>
        <span>✨ デモモード</span>
      </div>

      <div
        className="toggle-track"
        style={{ background: demoMode ? "linear-gradient(135deg,#f59e0b,#ef4444)" : "linear-gradient(135deg,#6e6e6e,#4b4b4b)", pointerEvents: "none" }}
      >
        <motion.div
          className="toggle-thumb"
          animate={{ left: demoMode ? "calc(100% - 23px)" : "3px" }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </div>

      <span className={demoMode ? "badge-admin" : "badge-user"} style={{ color: demoMode ? "#f59e0b" : "#ababab", background: demoMode ? "rgba(245,158,11,0.1)" : "rgba(255,255,255,0.06)", border: "none" }}>
        {demoMode ? "ON" : "OFF"}
      </span>
    </div>
  );
}

/* ============================
   ウェルカム（初期）画面
   ============================ */
function WelcomeView({ onPrompt }: { onPrompt: (p: string) => void }) {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 80,
      paddingLeft: 24,
      paddingRight: 24,
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: "center", marginBottom: 40 }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
          <motion.div
            animate={{ scale: [1, 1.05, 1] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          >
            <GeniusLogo size={52} />
          </motion.div>
        </div>

        <h1 style={{
          fontSize: 32,
          fontWeight: 600,
          background: "linear-gradient(135deg, #4285f4, #9b59b6, #ea4335)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          backgroundClip: "text",
          marginBottom: 8,
          lineHeight: 1.2,
        }}>
          こんにちは
        </h1>
        <p style={{ fontSize: 18, fontWeight: 500, color: "#6e6e6e" }}>
          左のパネルからソースを追加するか、何でも質問してください
        </p>
      </motion.div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, 1fr)",
        gap: 10,
        width: "100%",
        maxWidth: 680,
      }}>
        {quickPrompts.map((qp, i) => (
          <motion.button
            key={i}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.08 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onPrompt(qp.prompt)}
            className="suggestion-chip"
          >
            <span style={{ fontSize: 20, marginBottom: 4 }}>{qp.label.split(" ")[0]}</span>
            <span style={{ fontWeight: 500, fontSize: 13, color: "#e3e3e3" }}>
              {qp.label.split(" ").slice(1).join(" ")}
            </span>
            <span style={{ fontSize: 12, color: "#6e6e6e", lineHeight: 1.4 }}>
              {qp.prompt.length > 28 ? qp.prompt.slice(0, 28) + "…" : qp.prompt}
            </span>
          </motion.button>
        ))}
      </div>
    </div>
  );
}

/* ============================
   推奨プロンプト（会話継続中）
   ============================ */
function SuggestedPrompts({ onPick }: { onPick: (p: string) => void }) {
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", padding: "4px 0 24px" }}>
      {quickPrompts.map((qp, i) => (
        <button key={i} className="prompt-chip" onClick={() => onPick(qp.prompt)}>
          {qp.label}
        </button>
      ))}
    </div>
  );
}

/* ============================
   マイクボタン
   ============================ */
function MicBtn({ recording, onClick }: { recording: boolean; onClick: () => void }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      style={{
        width: 36, height: 36, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center",
        background: recording ? "linear-gradient(135deg,#ea4335,#c62828)" : "transparent",
        border: "none", cursor: "pointer", position: "relative",
      }}
      animate={recording ? {
        boxShadow: ["0 0 0 0 rgba(234,67,53,0.4)", "0 0 0 10px rgba(234,67,53,0)"],
      } : {}}
      transition={recording ? { duration: 1, repeat: Infinity } : {}}
    >
      {recording ? (
        <div style={{ display: "flex", alignItems: "center", gap: 2, height: 18 }}>
          {[12, 18, 14, 20, 10].map((h, i) => (
            <div key={i} className="wave-bar" style={{ height: h }} />
          ))}
        </div>
      ) : (
        <Mic size={18} style={{ color: "#ababab" }} />
      )}
    </motion.button>
  );
}

/* ============================
   ファイルアップロードバッジ
   ============================ */
function AttachedFileBadge({ name, onRemove }: { name: string; onRemove: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 4 }}
      style={{
        display: "inline-flex", alignItems: "center", gap: 8,
        padding: "5px 10px", borderRadius: 8,
        background: "rgba(138,180,248,0.12)",
        border: "1px solid rgba(138,180,248,0.3)",
        marginBottom: 8, maxWidth: "100%",
      }}
    >
      <span style={{ fontSize: 12, color: "#8ab4f8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        📎 {name}
      </span>
      <motion.button
        whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}
        onClick={onRemove}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
      >
        <X size={12} style={{ color: "#8ab4f8" }} />
      </motion.button>
    </motion.div>
  );
}

/* ============================
   チャット入力欄（下部固定・常時表示）
   ============================ */
function ChatInputBar({
  value,
  onChange,
  onSend,
  disabled,
  attachedFile,
  onAttachFile,
  onRemoveFile,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: (text?: string) => void;
  disabled: boolean;
  attachedFile: File | null;
  onAttachFile: (f: File) => void;
  onRemoveFile: () => void;
}) {
  const [recording, setRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  const handleMic = () => {
    setRecording((v) => !v);
    if (!recording) {
      setTimeout(() => setRecording(false), 4000);
    }
  };

  return (
    <div style={{ flexShrink: 0, background: "var(--bg-base)", padding: "12px 24px 20px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>
        <AnimatePresence>
          {attachedFile && (
            <AttachedFileBadge name={attachedFile.name} onRemove={onRemoveFile} />
          )}
        </AnimatePresence>

        <div className="input-wrapper" style={{ padding: "12px 16px" }}>
          <textarea
            value={value}
            onChange={(e) => {
              onChange(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
            }}
            onKeyDown={handleKey}
            placeholder={attachedFile ? "PDFについて質問する（空欄でも分析を開始します）" : "AVITO（アビト）に質問する"}
            rows={1}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              color: "#e3e3e3",
              fontSize: 15,
              lineHeight: "1.6",
              maxHeight: 160,
              overflowY: "auto",
              display: "block",
              marginBottom: 10,
            }}
          />

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <div style={{ display: "flex", gap: 4 }}>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) onAttachFile(f);
                  e.target.value = "";
                }}
              />
              <motion.button
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                onClick={() => fileInputRef.current?.click()}
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: attachedFile ? "rgba(138,180,248,0.15)" : "transparent",
                  border: "none", cursor: "pointer",
                }}
                title="PDFを添付"
              >
                <Paperclip size={18} style={{ color: attachedFile ? "#8ab4f8" : "#ababab" }} />
              </motion.button>
              <MicBtn recording={recording} onClick={handleMic} />
            </div>

            <motion.button
              onClick={() => onSend()}
              disabled={(!value.trim() && !attachedFile) || disabled}
              whileHover={(value.trim() || attachedFile) && !disabled ? { scale: 1.08 } : {}}
              whileTap={(value.trim() || attachedFile) && !disabled ? { scale: 0.92 } : {}}
              style={{
                width: 36, height: 36, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: (value.trim() || attachedFile) && !disabled
                  ? "linear-gradient(135deg, #4285f4, #9b59b6)"
                  : "rgba(255,255,255,0.08)",
                border: "none",
                cursor: (value.trim() || attachedFile) && !disabled ? "pointer" : "not-allowed",
                transition: "background 0.2s ease",
              }}
            >
              <Send size={16} style={{ color: (value.trim() || attachedFile) && !disabled ? "white" : "#6e6e6e" }} />
            </motion.button>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "#4b4b4b", marginTop: 8 }}>
          本システムは RAG基盤で社内ナレッジを参照しています
        </p>
      </div>
    </div>
  );
}

/* ============================
   ログイン画面
   ============================ */
function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (id === "admin" && password === "pass1234") {
      onLogin();
    } else {
      setError("IDまたはパスワードが間違っています");
    }
  };

  return (
    <div style={{
      height: "100vh", width: "100vw", background: "var(--bg-base)",
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column", padding: 20
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          width: "100%", maxWidth: 400, padding: 40,
          background: "var(--bg-sidebar)",
          borderRadius: 24,
          border: "1px solid var(--border-subtle)",
          boxShadow: "0 20px 40px rgba(0,0,0,0.4)"
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 24 }}>
          <GeniusLogo size={48} />
        </div>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "#e3e3e3", marginBottom: 4, lineHeight: 1.4, background: "linear-gradient(135deg, #4285f4, #9b59b6, #ea4335)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            AVITO
          </h1>
          <p style={{ fontSize: 11, color: "#ababab", marginBottom: 12, lineHeight: 1.3 }}>
            AI-driven Value into Transformative Organization<br/>
            <span style={{ color: "#8ab4f8", fontSize: 10 }}>〜 AIが、個の価値を組織へ変換する 〜</span>
          </p>
          <p style={{ fontSize: 12, color: "#8ab4f8", letterSpacing: "1px" }}>LOGIN SYSTEM</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, color: "#ababab", marginBottom: 8 }}>ID</label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 12,
                background: "var(--bg-base)", border: "1px solid var(--border-input)",
                color: "#e3e3e3", fontSize: 15, outline: "none"
              }}
              placeholder="admin"
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, color: "#ababab", marginBottom: 8 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 12,
                background: "var(--bg-base)", border: "1px solid var(--border-input)",
                color: "#e3e3e3", fontSize: 15, outline: "none"
              }}
              placeholder="••••••••"
            />
          </div>

          {error && <div style={{ color: "#ea4335", fontSize: 13, textAlign: "center" }}>{error}</div>}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            type="submit"
            style={{
              width: "100%", padding: 14, borderRadius: 12,
              background: "linear-gradient(135deg, #4285f4, #9b59b6)",
              color: "white", fontSize: 15, fontWeight: 600, border: "none",
              cursor: "pointer", marginTop: 12
            }}
          >
            ログイン
          </motion.button>
        </form>
      </motion.div>
    </div>
  );
}

/* ============================
   DB検索結果をHTMLテーブルへフォーマットする
   ============================ */
function formatDbResultsToHtml(results: Record<string, unknown>[], sql: string, durationMs: number): string {
  if (!results || results.length === 0) return "";

  const headers = Object.keys(results[0]);

  const headerHtml = headers.map(h => `<th style="padding: 10px 12px; border-bottom: 2px solid rgba(255,255,255,0.15); text-align: left; font-size: 13px; color: #8ab4f8; font-weight: 600;">${h}</th>`).join("");

  const rowsHtml = results.map(row => {
    const cells = headers.map(h => {
      let val = row[h];
      if (typeof val === 'number' && (h.toLowerCase().includes('amount') || h.toLowerCase().includes('price') || h.toLowerCase().includes('subtotal') || h.toLowerCase().includes('total') || val > 10000)) {
        val = `¥${val.toLocaleString()}`;
      }
      return `<td style="padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.06); font-size: 13px; color: #e3e3e3;">${val}</td>`;
    }).join("");
    return `<tr style="transition: background 0.15s ease;" onmouseover="this.style.background='rgba(255,255,255,0.02)'" onmouseout="this.style.background='transparent'">${cells}</tr>`;
  }).join("");

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #fff; background: rgba(30, 30, 38, 0.6); backdrop-filter: blur(10px); padding: 18px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.08); box-shadow: 0 10px 30px rgba(0,0,0,0.3); margin-top: 10px; overflow-x: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <span style="font-size: 12px; color: #10b981; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; background: rgba(16,185,129,0.1); padding: 4px 8px; border-radius: 100px;">
          ● DB連携成功
        </span>
        <span style="font-size: 11px; color: #ababab;">取得時間: ${durationMs}ms | 取得件数: ${results.length}件</span>
      </div>
      <table style="width: 100%; border-collapse: collapse; text-align: left;">
        <thead>
          <tr>${headerHtml}</tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

/* ============================
   ソースパネル（LEFT）
   ============================ */
const SOURCE_ICON_MAP: Record<string, { icon: React.ReactNode; color: string }> = {
  pdf:  { icon: <FileText size={16} />,        color: "#ea4335" },
  docx: { icon: <FileText size={16} />,        color: "#4285f4" },
  xlsx: { icon: <FileSpreadsheet size={16} />, color: "#34a853" },
  pptx: { icon: <Presentation size={16} />,    color: "#f59e0b" },
  txt:  { icon: <FileType size={16} />,        color: "#ababab" },
  memo: { icon: <StickyNote size={16} />,      color: "#fbbf24" },
};

function SourcePanel({
  sources,
  mode,
  onModeChange,
  onToggleSelected,
  onDelete,
  onUpload,
  memoOpen,
  onMemoOpenToggle,
  memoTitle,
  memoContent,
  onMemoTitleChange,
  onMemoContentChange,
  onMemoSubmit,
}: {
  sources: Source[];
  mode: ReferenceMode;
  onModeChange: (m: ReferenceMode) => void;
  onToggleSelected: (id: number, selected: boolean) => void;
  onDelete: (id: number) => void;
  onUpload: (file: File) => void;
  memoOpen: boolean;
  onMemoOpenToggle: () => void;
  memoTitle: string;
  memoContent: string;
  onMemoTitleChange: (v: string) => void;
  onMemoContentChange: (v: string) => void;
  onMemoSubmit: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <aside style={{
      width: 280, flexShrink: 0, display: "flex", flexDirection: "column",
      borderRight: "1px solid rgba(255,255,255,0.08)", overflow: "hidden",
      background: "var(--bg-sidebar)",
    }}>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, overflow: "hidden", flex: 1, minHeight: 0 }}>

        {/* ソース追加 */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.xlsx,.pptx,.txt"
          style={{ display: "none" }}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        <button className="panel-action-btn" onClick={() => fileInputRef.current?.click()}>
          <Plus size={16} /> ソースを追加
        </button>

        {/* 参照モード切替 */}
        <div style={{
          display: "flex", flexDirection: "column", gap: 6, padding: "10px 4px",
          borderTop: "1px solid rgba(255,255,255,0.06)", borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          <label className="mode-radio-row">
            <input type="radio" name="ref-mode" checked={mode === "auto"} onChange={() => onModeChange("auto")} />
            <span>自動参照モード</span>
          </label>
          <label className="mode-radio-row">
            <input type="radio" name="ref-mode" checked={mode === "manual"} onChange={() => onModeChange("manual")} />
            <span>手動参照モード</span>
          </label>
          {mode === "auto" ? (
            <div className="auto-search-badge"><Search size={11} /> 自動検索中...（PC内・ファイルサーバ・WEB）</div>
          ) : (
            <div style={{ fontSize: 11, color: "#6e6e6e", padding: "0 4px" }}>チェックしたソースのみ参照されます</div>
          )}
        </div>

        {/* ソース一覧 */}
        <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, minHeight: 0 }}>
          {sources.length === 0 && (
            <p style={{ fontSize: 12, color: "#6e6e6e", padding: "8px 4px" }}>まだソースがありません。</p>
          )}
          {sources.map((s) => {
            const cfg = SOURCE_ICON_MAP[s.type] ?? SOURCE_ICON_MAP.txt;
            const checked = mode === "auto" ? true : s.selected;
            return (
              <div key={s.id} className="source-row">
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={mode === "auto"}
                  onChange={(e) => onToggleSelected(s.id, e.target.checked)}
                  style={{ opacity: mode === "auto" ? 0.5 : 1 }}
                />
                <span style={{ color: cfg.color, display: "flex", flexShrink: 0 }}>{cfg.icon}</span>
                <span className="source-row-name" title={s.name}>{s.name}</span>
                <button className="source-row-delete" onClick={() => onDelete(s.id)} title="削除">
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>

        {/* メモを追加 */}
        <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 12, flexShrink: 0 }}>
          <button className="panel-action-btn secondary" onClick={onMemoOpenToggle}>
            <NotebookPen size={16} /> メモを追加
          </button>
          <AnimatePresence initial={false}>
            {memoOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                  <input
                    className="memo-input"
                    placeholder="メモのタイトル"
                    value={memoTitle}
                    onChange={(e) => onMemoTitleChange(e.target.value)}
                  />
                  <textarea
                    className="memo-textarea"
                    placeholder="メモの内容"
                    rows={4}
                    value={memoContent}
                    onChange={(e) => onMemoContentChange(e.target.value)}
                  />
                  <button
                    className="panel-action-btn primary"
                    disabled={!memoTitle.trim() || !memoContent.trim()}
                    onClick={onMemoSubmit}
                  >
                    ソースに変換
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </aside>
  );
}

/* ============================
   Studioパネル（RIGHT）
   ============================ */
const PRESETS: { key: string; icon: React.ReactNode; label: string; prompt: string }[] = [
  { key: "report", icon: <BarChart3 size={20} />, label: "レポート", prompt: "現在のソースをもとに詳細な報告書(レポート)を生成してください。" },
  { key: "slides", icon: <Presentation size={20} />, label: "スライド資料", prompt: "現在の内容をPowerPoint形式のスライドにまとめてください。" },
  { key: "audio", icon: <Mic size={20} />, label: "音声解説", prompt: "現在のソースの内容を音声解説用のナレーションスクリプトとして作成してください。" },
  { key: "mindmap", icon: <MapIcon size={20} />, label: "マインドマップ", prompt: "現在のソースの内容を見出しと階層構造を使ったマインドマップ形式で整理してください。" },
  { key: "summary", icon: <ClipboardList size={20} />, label: "要約", prompt: "現在のソースの内容を簡潔に要約してください。" },
  { key: "quiz", icon: <CircleHelp size={20} />, label: "クイズ", prompt: "現在のソースの内容から理解度を確認するクイズを5問作成してください。" },
  { key: "infographic", icon: <TrendingUp size={20} />, label: "インフォグラフィ", prompt: "現在のソースの内容を視覚的に把握しやすいインフォグラフィ風の構成で説明してください。" },
  { key: "datatable", icon: <Table2 size={20} />, label: "データ表", prompt: "現在のソースの内容を表形式に整理してまとめてください。" },
];

function OutputFileRow({ file }: { file: OutputFile }) {
  const cfg = (file.type && {
    excel: { icon: <FileSpreadsheet size={16} />, color: "#34a853" },
    word: { icon: <FileText size={16} />, color: "#4285f4" },
    powerpoint: { icon: <Presentation size={16} />, color: "#ea4335" },
  }[file.type]) ?? { icon: <FileText size={16} />, color: "#ababab" };

  return (
    <div className="output-file-row">
      <span style={{ color: cfg.color, display: "flex", flexShrink: 0 }}>{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="output-file-name">{file.filename}</div>
        <div className="output-file-size">{file.size}</div>
      </div>
      <a href={file.downloadUrl} download className="output-file-dl" title="ダウンロード">
        <Download size={14} />
      </a>
    </div>
  );
}

function StudioPanel({
  tab,
  onTabChange,
  onPreset,
  outputFiles,
  draftTitle,
  draftContent,
  onDraftTitleChange,
  onDraftContentChange,
  drafts,
  onSelectDraft,
  onConvertDraft,
  onNewDraft,
}: {
  tab: StudioTab;
  onTabChange: (t: StudioTab) => void;
  onPreset: (prompt: string) => void;
  outputFiles: OutputFile[];
  draftTitle: string;
  draftContent: string;
  onDraftTitleChange: (v: string) => void;
  onDraftContentChange: (v: string) => void;
  drafts: MemoDraft[];
  onSelectDraft: (d: MemoDraft) => void;
  onConvertDraft: () => void;
  onNewDraft: () => void;
}) {
  return (
    <aside style={{
      width: 320, flexShrink: 0, display: "flex", flexDirection: "column",
      borderLeft: "1px solid rgba(255,255,255,0.08)", background: "var(--bg-sidebar)", overflow: "hidden",
    }}>
      <div style={{ display: "flex", borderBottom: "1px solid rgba(255,255,255,0.08)", flexShrink: 0 }}>
        <button className={`tab-btn${tab === "studio" ? " active" : ""}`} onClick={() => onTabChange("studio")}>Studio</button>
        <button className={`tab-btn${tab === "memo" ? " active" : ""}`} onClick={() => onTabChange("memo")}>メモ</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, minHeight: 0 }}>
        {tab === "studio" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 22 }}>
              {PRESETS.map((p) => (
                <button key={p.key} className="preset-card" onClick={() => onPreset(p.prompt)}>
                  <span style={{ color: "#8ab4f8" }}>{p.icon}</span>
                  <span>{p.label}</span>
                </button>
              ))}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: "#6e6e6e", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.3px" }}>
              出力ファイル
            </div>
            {outputFiles.length === 0 ? (
              <p style={{ fontSize: 12, color: "#6e6e6e" }}>まだ生成されたファイルはありません。</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {outputFiles.map((f) => (
                  <OutputFileRow key={f.id} file={f} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <input
              className="memo-input"
              placeholder="メモタイトル"
              value={draftTitle}
              onChange={(e) => onDraftTitleChange(e.target.value)}
            />
            <textarea
              className="memo-textarea"
              placeholder="メモ本文"
              rows={8}
              value={draftContent}
              onChange={(e) => onDraftContentChange(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button className="panel-action-btn secondary" style={{ flex: 1 }} onClick={onNewDraft}>新規</button>
              <button
                className="panel-action-btn primary"
                style={{ flex: 1 }}
                disabled={!draftTitle.trim() || !draftContent.trim()}
                onClick={onConvertDraft}
              >
                ソースに変換
              </button>
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: "#6e6e6e", marginTop: 12, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.3px" }}>
              保存済みメモ
            </div>
            {drafts.length === 0 ? (
              <p style={{ fontSize: 12, color: "#6e6e6e" }}>メモはまだありません。</p>
            ) : (
              drafts.map((d) => (
                <div key={d.id} className="draft-row" onClick={() => onSelectDraft(d)}>
                  <StickyNote size={13} style={{ color: "#fbbf24", flexShrink: 0 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.title}</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
}

/* ============================
   メインページ
   ============================ */
export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [role, setRole]         = useState<UserRole>("admin");
  const [demoMode, setDemoMode] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("");
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [sessionId, setSessionId] = useState(() => Date.now().toString());
  const bottomRef = useRef<HTMLDivElement>(null);

  // ソースパネル
  const [sources, setSources] = useState<Source[]>([]);
  const [refMode, setRefMode] = useState<ReferenceMode>("auto");
  const [memoOpen, setMemoOpen] = useState(false);
  const [memoTitle, setMemoTitle] = useState("");
  const [memoContent, setMemoContent] = useState("");

  // Studioパネル
  const [studioTab, setStudioTab] = useState<StudioTab>("studio");
  const [outputFiles, setOutputFiles] = useState<OutputFile[]>([]);
  const [drafts, setDrafts] = useState<MemoDraft[]>([]);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftContent, setDraftContent] = useState("");
  const [editingDraftId, setEditingDraftId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, generating, thinkingLabel]);

  /* ---- ソース一覧の取得・自動リフレッシュ ---- */
  const fetchSources = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/sources/`);
      if (!res.ok) return;
      const data = await res.json();
      setSources(data.sources ?? []);
    } catch (e) {
      console.error("ソース一覧取得エラー:", e);
    }
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 初回マウント時のソース一覧フェッチ
    fetchSources();
    const interval = setInterval(fetchSources, 8000);
    return () => clearInterval(interval);
  }, [isLoggedIn, fetchSources]);

  const handleUploadSource = useCallback(async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE}/api/sources/upload`, { method: "POST", body: formData });
      if (!res.ok) {
        console.error("ソースアップロード失敗:", res.status);
        return;
      }
      await fetchSources();
    } catch (e) {
      console.error("ソースアップロードエラー:", e);
    }
  }, [fetchSources]);

  const handleToggleSelected = useCallback(async (id: number, selected: boolean) => {
    setSources((prev) => prev.map((s) => (s.id === id ? { ...s, selected } : s)));
    try {
      await fetch(`${API_BASE}/api/sources/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selected }),
      });
    } catch (e) {
      console.error("選択状態更新エラー:", e);
    }
  }, []);

  const handleDeleteSource = useCallback(async (id: number) => {
    setSources((prev) => prev.filter((s) => s.id !== id));
    try {
      await fetch(`${API_BASE}/api/sources/${id}`, { method: "DELETE" });
    } catch (e) {
      console.error("ソース削除エラー:", e);
    }
  }, []);

  const createMemoSource = useCallback(async (title: string, content: string) => {
    if (!title.trim() || !content.trim()) return false;
    try {
      const res = await fetch(`${API_BASE}/api/sources/memo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
      if (!res.ok) return false;
      await fetchSources();
      return true;
    } catch (e) {
      console.error("メモソース作成エラー:", e);
      return false;
    }
  }, [fetchSources]);

  const handleQuickMemoSubmit = useCallback(async () => {
    const ok = await createMemoSource(memoTitle, memoContent);
    if (ok) {
      setMemoTitle("");
      setMemoContent("");
      setMemoOpen(false);
    }
  }, [memoTitle, memoContent, createMemoSource]);

  const handleConvertDraftToSource = useCallback(async () => {
    const ok = await createMemoSource(draftTitle, draftContent);
    if (ok) {
      setDrafts((prev) => prev.filter((d) => d.id !== editingDraftId));
      setDraftTitle("");
      setDraftContent("");
      setEditingDraftId(null);
    }
  }, [draftTitle, draftContent, editingDraftId, createMemoSource]);

  const handleSaveMessageToMemo = useCallback((content: string) => {
    const id = Date.now().toString();
    const title = content.slice(0, 24) + (content.length > 24 ? "…" : "");
    setDrafts((prev) => [{ id, title, content }, ...prev]);
    setDraftTitle(title);
    setDraftContent(content);
    setEditingDraftId(id);
    setStudioTab("memo");
  }, []);

  const handleFeedback = useCallback((id: string, value: "up" | "down") => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, feedback: m.feedback === value ? undefined : value } : m)));
  }, []);

  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    const hasPdf = !!attachedFile;

    if (!content && !hasPdf) return;
    if (generating) return;

    const displayContent = content || (hasPdf ? `${attachedFile!.name} を分析してください` : "");

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: displayContent,
      attachedFileName: attachedFile?.name,
      timestamp: new Date(),
    };
    setMessages((p) => [...p, userMsg]);
    setInput("");
    const capturedFile = attachedFile;
    setAttachedFile(null);
    setGenerating(true);

    // ===== デモモードがONの場合は、従来通りモックデータを返す =====
    if (demoMode) {
      if (capturedFile) {
        const pdfPhases = [
          { label: "PDFを解析中...", durationMs: 1000 },
          { label: "データを抽出中...", durationMs: 800 },
          { label: "Claude Sonnetに送信中...", durationMs: 1200 },
          { label: "ダッシュボードを生成中...", durationMs: 1500 },
        ];
        for (const phase of pdfPhases) {
          setThinkingLabel(phase.label);
          await new Promise((r) => setTimeout(r, phase.durationMs));
        }
        setThinkingLabel("");

        const mockHtml = `
          <div style="font-family: sans-serif; color: #fff; background: #1e1e24; padding: 20px; border-radius: 12px;">
            <h3 style="margin-top: 0; color: #8ab4f8;">📊 損益比較分析ダッシュボード (DEMO)</h3>
            <p style="font-size: 13px; color: #ccc;">PDF: ${capturedFile.name} の解析結果</p>
            <div style="margin: 20px 0; border: 1px dashed rgba(255,255,255,0.2); padding: 15px; border-radius: 8px;">
              <span style="font-size: 24px; font-weight: bold; color: #34a853;">¥12,450,000</span>
              <span style="font-size: 12px; color: #aaa; margin-left: 10px;">当月想定粗利益</span>
            </div>
            <p style="font-size: 12px; color: #888; text-align: right;">※デモモード用のモック表示です</p>
          </div>
        `;

        setMessages((p) => [
          ...p,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: "PDFの解析が完了しました。以下のダッシュボードに主要な指標をまとめましたのでご確認ください。",
            htmlContent: mockHtml,
            timestamp: new Date(),
          },
        ]);
        setGenerating(false);
        return;
      }

      await new Promise((r) => setTimeout(r, 1800));
      const res = getMockResponse(content, role);

      const phases = THINKING_PHASES[res.thinkingKey ?? "default"] ?? THINKING_PHASES.default;
      for (const phase of phases) {
        setThinkingLabel(phase.label);
        await new Promise((r) => setTimeout(r, phase.durationMs));
      }
      setThinkingLabel("");

      setMessages((p) => [...p, { id: (Date.now() + 1).toString(), role: "assistant", timestamp: new Date(), ...res }]);
      setGenerating(false);
      return;
    }

    // ===== デモモードがOFFの場合：FastAPIの実接続を行う =====
    try {
      // 1. PDF添付あり：FastAPIの /api/chat/analyze-pdf を呼び出して即時分析
      if (capturedFile) {
        const pdfPhases = [
          { label: "PDFを読み込み中...", durationMs: 800 },
          { label: "テキストを抽出中...", durationMs: 800 },
          { label: "AVITOエンジンで財務分析中...", durationMs: 1200 },
          { label: "インタラクティブグラフを生成中...", durationMs: 1000 },
        ];
        for (const phase of pdfPhases) {
          setThinkingLabel(phase.label);
          await new Promise((r) => setTimeout(r, phase.durationMs));
        }

        const formData = new FormData();
        formData.append("file", capturedFile);
        formData.append("prompt", content || "財務諸表を詳しく分析し、売上利益の推移と改善策をまとめてください。");
        formData.append("session_id", sessionId);

        const res = await fetch(`${API_BASE}/api/chat/analyze-pdf`, {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          throw new Error(`PDF分析APIエラー: ${res.status}`);
        }

        const data = await res.json();

        setMessages((p) => [
          ...p,
          {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: data.content,
            htmlContent: data.htmlContent,
            timestamp: new Date(),
          },
        ]);

        setThinkingLabel("");
        setGenerating(false);
        return;
      }

      // 2. PDFなし：通常のチャット対話RAG API / 文書生成APIの呼び出し
      let detectedDocType: "excel" | "word" | "powerpoint" | null = null;
      let apiDocType: "excel" | "word" | "pptx" | null = null;

      const lowerContent = content.toLowerCase();
      if (lowerContent.includes("excel") || lowerContent.includes("見積")) {
        detectedDocType = "excel";
        apiDocType = "excel";
      } else if (lowerContent.includes("word") || lowerContent.includes("報告")) {
        detectedDocType = "word";
        apiDocType = "word";
      } else if (lowerContent.includes("powerpoint") || lowerContent.includes("提案") || lowerContent.includes("ppt")) {
        detectedDocType = "powerpoint";
        apiDocType = "pptx";
      }

      let fileChipData = undefined;

      if (apiDocType) {
        setThinkingLabel(`${apiDocType.toUpperCase()}ファイルを自動作成中...`);
        try {
          const resDoc = await fetch(`${API_BASE}/api/documents/generate`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              doc_type: apiDocType,
              requirements: content,
              search_query: content,
            }),
          });

          if (resDoc.ok) {
            const blob = await resDoc.blob();
            const downloadUrl = URL.createObjectURL(blob);
            const extMap = { excel: "xlsx", word: "docx", pptx: "pptx" };
            const filename = `AVITO_${apiDocType}_${Date.now().toString().slice(-4)}.${extMap[apiDocType]}`;

            fileChipData = {
              type: detectedDocType,
              filename: filename,
              size: `${Math.round(blob.size / 1024)} KB`,
              downloadUrl: downloadUrl,
            };

            setOutputFiles((prev) => [{ id: Date.now().toString(), ...fileChipData! }, ...prev]);
          }
        } catch (err) {
          console.error("文書自動生成エラー:", err);
        }
      }

      // 3. データベース連携（NL2SQL）の判定
      const dbKeywords = ["売上", "利益", "残高", "仕訳", "科目", "顧客", "商品", "受注", "db", "データベース", "sql", "勘定", "キャッシュフロー"];
      const isDbQuery = dbKeywords.some(kw => content.toLowerCase().includes(kw));

      if (isDbQuery) {
        setThinkingLabel("データベースを解析中 (NL2SQL)...");
        try {
          const resDb = await fetch(`${API_BASE}/api/db/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              query: content,
              session_id: sessionId,
            }),
          });

          if (!resDb.ok) {
            throw new Error(`DBクエリAPIエラー: ${resDb.status}`);
          }

          const dbData = await resDb.json();
          setThinkingLabel("");

          if (dbData.success) {
            const formattedResults = dbData.results && dbData.results.length > 0
              ? formatDbResultsToHtml(dbData.results, dbData.sql, dbData.duration_ms)
              : `<div style="color: #ababab; padding: 10px; font-style: italic;">該当するデータが見つかりませんでした。</div>`;

            setMessages((p) => [
              ...p,
              {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: `模擬データベースを照会しました。\n\n**【実行したSQL】**\n\`\`\`sql\n${dbData.sql}\n\`\`\``,
                htmlContent: formattedResults,
                timestamp: new Date(),
              },
            ]);
          } else {
            setMessages((p) => [
              ...p,
              {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: `⚠️ データベースクエリの実行に失敗したか、安全性のチェックによりブロックされました。\n\n**エラー詳細:** ${dbData.error}`,
                timestamp: new Date(),
              },
            ]);
          }
          setGenerating(false);
          return;
        } catch (err) {
          console.error("DB連携API接続エラー:", err);
        }
      }

      // チャット対話RAG APIの呼び出し
      setThinkingLabel("社内ナレッジをRAG検索中...");

      const resChat = await fetch(`${API_BASE}/api/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          session_id: sessionId,
          mode: role === "admin" ? "internal" : "proposal",
        }),
      });

      if (!resChat.ok) {
        throw new Error(`APIエラー: ${resChat.status}`);
      }

      const data = await resChat.json();

      setMessages((p) => [
        ...p,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.answer,
          fileChip: fileChipData,
          citations: data.sources && data.sources.length > 0 ? data.sources : undefined,
          timestamp: new Date(),
        },
      ]);

    } catch (e) {
      console.error(e);
      setMessages((p) => [
        ...p,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "申し訳ありません。ローカルAI APIとの接続に失敗しました。FastAPIコンテナ（localhost:8000）が起動しているか確認してください。",
          timestamp: new Date(),
        },
      ]);
    }

    setThinkingLabel("");
    setGenerating(false);
  }, [input, generating, role, attachedFile, demoMode, sessionId]);

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setAttachedFile(null);
    setSessionId(Date.now().toString());
  };

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div style={{ height: "100vh", width: "100vw", display: "flex", flexDirection: "column", background: "var(--bg-base)", overflow: "hidden" }}>

      {/* ===== ヘッダー ===== */}
      <header style={{
        height: 56,
        flexShrink: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
        borderBottom: "1px solid rgba(255,255,255,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <GeniusLogo size={26} />
          <span style={{ fontWeight: 700, fontSize: 16, color: "#8ab4f8", letterSpacing: "0.5px" }}>AVITO</span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <DemoToggle demoMode={demoMode} onToggle={() => setDemoMode((v) => !v)} />
          <RoleToggle
            role={role}
            onToggle={() => {
              setRole((r) => (r === "admin" ? "user" : "admin"));
              handleNewChat();
            }}
          />
        </div>
      </header>

      {/* ===== 3カラム ===== */}
      <div style={{ flex: 1, display: "flex", minHeight: 0, overflow: "hidden" }}>

        {/* LEFT: ソースパネル */}
        <SourcePanel
          sources={sources}
          mode={refMode}
          onModeChange={setRefMode}
          onToggleSelected={handleToggleSelected}
          onDelete={handleDeleteSource}
          onUpload={handleUploadSource}
          memoOpen={memoOpen}
          onMemoOpenToggle={() => setMemoOpen((v) => !v)}
          memoTitle={memoTitle}
          memoContent={memoContent}
          onMemoTitleChange={setMemoTitle}
          onMemoContentChange={setMemoContent}
          onMemoSubmit={handleQuickMemoSubmit}
        />

        {/* CENTER: チャットパネル */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <div className="chat-scroll" style={{ display: "flex", flexDirection: "column" }}>
            {messages.length === 0 && !generating ? (
              <WelcomeView onPrompt={(p) => handleSend(p)} />
            ) : (
              <div style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "32px 24px 0" }}>
                <AnimatePresence>
                  {messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      onSaveMemo={handleSaveMessageToMemo}
                      onFeedback={handleFeedback}
                    />
                  ))}
                </AnimatePresence>
                <AnimatePresence>
                  {generating && <GeneratingIndicator label={thinkingLabel} />}
                </AnimatePresence>
                {!generating && messages.length > 0 && messages[messages.length - 1].role === "assistant" && (
                  <SuggestedPrompts onPick={(p) => handleSend(p)} />
                )}
                <div ref={bottomRef} style={{ height: 8 }} />
              </div>
            )}
          </div>

          <ChatInputBar
            value={input}
            onChange={setInput}
            onSend={handleSend}
            disabled={generating}
            attachedFile={attachedFile}
            onAttachFile={setAttachedFile}
            onRemoveFile={() => setAttachedFile(null)}
          />
        </div>

        {/* RIGHT: Studioパネル */}
        <StudioPanel
          tab={studioTab}
          onTabChange={setStudioTab}
          onPreset={(p) => handleSend(p)}
          outputFiles={outputFiles}
          draftTitle={draftTitle}
          draftContent={draftContent}
          onDraftTitleChange={setDraftTitle}
          onDraftContentChange={setDraftContent}
          drafts={drafts}
          onSelectDraft={(d) => {
            setDraftTitle(d.title);
            setDraftContent(d.content);
            setEditingDraftId(d.id);
          }}
          onConvertDraft={handleConvertDraftToSource}
          onNewDraft={() => {
            setDraftTitle("");
            setDraftContent("");
            setEditingDraftId(null);
          }}
        />
      </div>
    </div>
  );
}
