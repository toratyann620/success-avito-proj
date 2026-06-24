"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Mic, Paperclip, Send, Shield, User, X,
  Search, StickyNote, FileText, FileSpreadsheet,
  Presentation, FileType, Download,
  Settings, Globe, FolderOpen, Server, Loader2,
} from "lucide-react";
import type { Message, UserRole, Source, OutputFileRecord, AutoSearchResult, WatchPath } from "@/app/lib/mockData";
import { getMockResponse, PROMPT_TEMPLATES, THINKING_PHASES } from "@/app/lib/mockData";
import { MessageBubble, GeneratingIndicator, GeniusLogo } from "@/app/components/MessageBubble";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3101";

type StudioTab = "studio" | "memo";
type MemoDraft = { id: string; title: string; content: string };
type ManualInputType = "localPath" | "serverPath" | "url" | null;
type OutputFormat = "excel" | "word" | "powerpoint";

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
        background: "rgba(0,0,0,0.06)",
        border: "1px solid rgba(0,0,0,0.1)",
        fontSize: 13, color: "var(--text-secondary)",
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
        background: "rgba(0,0,0,0.06)",
        border: "1px solid rgba(0,0,0,0.1)",
        fontSize: 13, color: "var(--text-secondary)",
      }}>
        <span>✨ デモモード</span>
      </div>

      <div
        className="toggle-track"
        style={{ background: demoMode ? "linear-gradient(135deg,#f59e0b,#ef4444)" : "linear-gradient(135deg,#9aa0a6,#5f6368)", pointerEvents: "none" }}
      >
        <motion.div
          className="toggle-thumb"
          animate={{ left: demoMode ? "calc(100% - 23px)" : "3px" }}
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
        />
      </div>

      <span className={demoMode ? "badge-admin" : "badge-user"} style={{ color: demoMode ? "#f59e0b" : "var(--text-secondary)", background: demoMode ? "rgba(245,158,11,0.1)" : "rgba(0,0,0,0.06)", border: "none" }}>
        {demoMode ? "ON" : "OFF"}
      </span>
    </div>
  );
}

/* ============================
   ウェルカム（初期）画面
   ============================ */
function WelcomeView() {
  return (
    <div style={{
      flex: 1,
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      paddingBottom: 24,
      paddingLeft: 24,
      paddingRight: 24,
    }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        style={{ textAlign: "center" }}
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
        <p style={{ fontSize: 18, fontWeight: 500, color: "var(--text-tertiary)" }}>
          左のパネルからソースを追加するか、何でも質問してください
        </p>
      </motion.div>
    </div>
  );
}

/* ============================
   プロンプトボックス（4×2グリッド・チャット入力欄の上部）
   ============================ */
function PromptTemplateGrid({ onPick }: { onPick: (content: string) => void }) {
  const boxes = [
    ...PROMPT_TEMPLATES.map((t) => ({ key: t.key, icon: t.icon, label: t.label, content: t.content })),
    ...Array.from({ length: 4 }, (_, i) => ({ key: `custom-${i}`, icon: "＋", label: "カスタム追加", content: null })),
  ];

  return (
    <div className="prompt-grid">
      {boxes.map((b) => (
        <button
          key={b.key}
          className={`prompt-box${b.content === null ? " placeholder" : ""}`}
          onClick={() => { if (b.content !== null) onPick(b.content); }}
        >
          <span className="prompt-box-icon">{b.icon}</span>
          <span className="prompt-box-label">{b.label}</span>
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
        <Mic size={18} style={{ color: "var(--text-secondary)" }} />
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
        background: "rgba(26,115,232,0.12)",
        border: "1px solid rgba(26,115,232,0.3)",
        marginBottom: 8, maxWidth: "100%",
      }}
    >
      <span style={{ fontSize: 12, color: "var(--accent-blue)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        📎 {name}
      </span>
      <motion.button
        whileHover={{ scale: 1.2 }} whileTap={{ scale: 0.9 }}
        onClick={onRemove}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex" }}
      >
        <X size={12} style={{ color: "var(--accent-blue)" }} />
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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "44px";
    el.style.height = Math.max(44, Math.min(el.scrollHeight, 240)) + "px";
  };

  useEffect(() => { adjustHeight(); }, [value]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      // Ctrl+Enter（Windows/Linux）または Cmd+Enter（Mac）で送信
      e.preventDefault();
      onSend();
    }
    // それ以外のEnterは通常の改行として扱う（デフォルト動作）
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
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKey}
            placeholder={attachedFile ? "PDFについて質問する（空欄でも分析を開始します）" : "AVITO（アビト）に質問する（Ctrl+Enter または Cmd+Enter で送信）"}
            rows={1}
            style={{
              width: "100%",
              background: "transparent",
              border: "none",
              outline: "none",
              resize: "none",
              color: "var(--text-primary)",
              fontSize: 15,
              lineHeight: "1.6",
              minHeight: 44,
              maxHeight: 240,
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
                  background: attachedFile ? "rgba(26,115,232,0.15)" : "transparent",
                  border: "none", cursor: "pointer",
                }}
                title="PDFを添付"
              >
                <Paperclip size={18} style={{ color: attachedFile ? "var(--accent-blue)" : "var(--text-secondary)" }} />
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
                  : "rgba(0,0,0,0.08)",
                border: "none",
                cursor: (value.trim() || attachedFile) && !disabled ? "pointer" : "not-allowed",
                transition: "background 0.2s ease",
              }}
            >
              <Send size={16} style={{ color: (value.trim() || attachedFile) && !disabled ? "white" : "var(--text-tertiary)" }} />
            </motion.button>
          </div>
        </div>

        <p style={{ textAlign: "center", fontSize: 12, color: "var(--text-tertiary)", marginTop: 8 }}>
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
          <h1 style={{ fontSize: 24, fontWeight: 700, color: "var(--text-primary)", marginBottom: 4, lineHeight: 1.4, background: "linear-gradient(135deg, #4285f4, #9b59b6, #ea4335)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text" }}>
            AVITO
          </h1>
          <p style={{ fontSize: 11, color: "var(--text-secondary)", marginBottom: 12, lineHeight: 1.3 }}>
            AI-driven Value into Transformative Organization<br/>
            <span style={{ color: "var(--accent-blue)", fontSize: 10 }}>〜 AIが、個の価値を組織へ変換する 〜</span>
          </p>
          <p style={{ fontSize: 12, color: "var(--accent-blue)", letterSpacing: "1px" }}>LOGIN SYSTEM</p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>ID</label>
            <input
              type="text"
              value={id}
              onChange={(e) => setId(e.target.value)}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 12,
                background: "var(--bg-base)", border: "1px solid var(--border-input)",
                color: "var(--text-primary)", fontSize: 15, outline: "none"
              }}
              placeholder="admin"
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%", padding: "12px 16px", borderRadius: 12,
                background: "var(--bg-base)", border: "1px solid var(--border-input)",
                color: "var(--text-primary)", fontSize: 15, outline: "none"
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
   NL2SQL起動判定
   プロンプトテンプレート（見積作成用等）はDB系キーワードを多数含むため、
   誤ってNL2SQLに振り分けないよう、テンプレート特有のフレーズを含む場合や
   長文は除外し、明確なDB系キーワードを含む短文のみNL2SQL対象とする。
   ============================ */
function shouldUseNl2sql(message: string): boolean {
  const templatePhrases = [
    "あなたは", "# 目的", "# 作成ルール", "# 出力形式",
    "専門家です", "アナリストです", "以下の情報をもとに",
    "[[", "作成してください。\n#",
  ];
  if (templatePhrases.some((phrase) => message.includes(phrase))) return false;

  if (message.length >= 300) return false;

  const dbKeywords = ["売上", "在庫", "受注一覧", "顧客別", "集計してください", "前月比", "前年比", "データベース", "db", "クエリ"];
  const lower = message.toLowerCase();
  return dbKeywords.some((kw) => lower.includes(kw.toLowerCase()));
}

/* ============================
   RAG検索起動判定
   バックエンド(chat.py)の should_use_rag() と同一ロジック。
   応答待ち中の「社内ナレッジをRAG検索中.../AIが回答中...」表示を
   レスポンス受信前に決定するため、フロント側でも同じ判定を行う。
   ============================ */
function shouldUseRag(message: string, selectedSourceIds: number[]): boolean {
  if (selectedSourceIds.length === 0) return false;

  const skipPhrases = [
    "修正して", "変更して", "直して", "教えて",
    "ありがとう", "わかりました", "了解",
    "こんにちは", "おはよう", "よろしく",
    "出力して", "ダウンロード", "まとめて",
  ];
  if (message.length < 30 && skipPhrases.some((p) => message.includes(p))) return false;

  return true;
}

/* ============================
   DB検索結果をHTMLテーブルへフォーマットする
   ============================ */
function formatDbResultsToHtml(results: Record<string, unknown>[], sql: string, durationMs: number): string {
  if (!results || results.length === 0) return "";

  const headers = Object.keys(results[0]);

  const headerHtml = headers.map(h => `<th style="padding: 10px 12px; border-bottom: 2px solid rgba(0,0,0,0.15); text-align: left; font-size: 13px; color: var(--accent-blue); font-weight: 600;">${h}</th>`).join("");

  const rowsHtml = results.map(row => {
    const cells = headers.map(h => {
      let val = row[h];
      if (typeof val === 'number' && (h.toLowerCase().includes('amount') || h.toLowerCase().includes('price') || h.toLowerCase().includes('subtotal') || h.toLowerCase().includes('total') || val > 10000)) {
        val = `¥${val.toLocaleString()}`;
      }
      return `<td style="padding: 10px 12px; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 13px; color: var(--text-primary);">${val}</td>`;
    }).join("");
    return `<tr style="transition: background 0.15s ease;" onmouseover="this.style.background='rgba(0,0,0,0.02)'" onmouseout="this.style.background='transparent'">${cells}</tr>`;
  }).join("");

  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: var(--text-primary); background: rgba(255,255,255,0.8); backdrop-filter: blur(10px); padding: 18px; border-radius: 16px; border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 10px 30px rgba(0,0,0,0.12); margin-top: 10px; overflow-x: auto;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px;">
        <span style="font-size: 12px; color: #10b981; font-weight: 600; display: inline-flex; align-items: center; gap: 4px; background: rgba(16,185,129,0.1); padding: 4px 8px; border-radius: 100px;">
          ● DB連携成功
        </span>
        <span style="font-size: 11px; color: var(--text-secondary);">取得時間: ${durationMs}ms | 取得件数: ${results.length}件</span>
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
  txt:  { icon: <FileType size={16} />,        color: "var(--text-secondary)" },
  memo: { icon: <StickyNote size={16} />,      color: "#fbbf24" },
  url:  { icon: <Globe size={16} />,           color: "#60a5fa" },
};

const MANUAL_INPUT_CONFIG: Record<NonNullable<ManualInputType>, { label: string; placeholder: string }> = {
  localPath: { label: "ローカルPATHを指定", placeholder: "/Users/xxx/Documents/見積書.docx" },
  serverPath: { label: "ファイルサーバPATHを指定", placeholder: "/mnt/watch_roots/xxx/契約書.pdf" },
  url: { label: "WEBのURLを指定", placeholder: "https://example.com/page" },
};

function SourcePanel({
  sources,
  onUploadFile,
  onAddPath,
  onAddUrl,
  onToggleSelected,
  onDelete,
  onAutoSearch,
  onAddAutoSearchCandidate,
  onOpenSettings,
}: {
  sources: Source[];
  onUploadFile: (file: File) => void;
  onAddPath: (path: string, label: string, sourceType: "local_path" | "server_path") => Promise<boolean>;
  onAddUrl: (url: string, label: string) => Promise<boolean>;
  onToggleSelected: (id: number, selected: boolean) => void;
  onDelete: (id: number) => void;
  onAutoSearch: (keyword: string) => Promise<AutoSearchResult[]>;
  onAddAutoSearchCandidate: (result: AutoSearchResult) => Promise<boolean>;
  onOpenSettings: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeManualInput, setActiveManualInput] = useState<ManualInputType>(null);
  const [pathInputValue, setPathInputValue] = useState("");
  const [pathSubmitting, setPathSubmitting] = useState(false);

  const [keyword, setKeyword] = useState("");
  const [searchResults, setSearchResults] = useState<AutoSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingPath, setAddingPath] = useState<string | null>(null);

  const closeManualInput = () => {
    setActiveManualInput(null);
    setPathInputValue("");
  };

  const handleManualSubmit = async () => {
    const value = pathInputValue.trim();
    if (!value || !activeManualInput) return;
    setPathSubmitting(true);
    const label = value.split("/").pop() || value;
    const ok = activeManualInput === "url"
      ? await onAddUrl(value, label)
      : await onAddPath(value, label, activeManualInput === "localPath" ? "local_path" : "server_path");
    setPathSubmitting(false);
    if (ok) closeManualInput();
  };

  const handleSearchSubmit = async () => {
    const kw = keyword.trim();
    if (!kw) return;
    setSearching(true);
    const results = await onAutoSearch(kw);
    setSearchResults(results);
    setSearching(false);
  };

  const handleAddCandidate = async (result: AutoSearchResult) => {
    setAddingPath(result.path);
    const ok = await onAddAutoSearchCandidate(result);
    setAddingPath(null);
    if (ok) {
      setSearchResults((prev) => prev.filter((r) => r.path !== result.path));
    }
  };

  return (
    <aside style={{
      width: 280, flexShrink: 0, display: "flex", flexDirection: "column",
      borderRight: "1px solid rgba(0,0,0,0.08)", overflow: "hidden",
      background: "var(--bg-sidebar)",
    }}>
      <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 14, overflow: "hidden", flex: 1, minHeight: 0 }}>

        {/* ===== 手動入力セクション ===== */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 12 }}>
          <div className="source-section-label">手動入力</div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.docx,.xlsx,.pptx,.txt"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onUploadFile(f);
              e.target.value = "";
            }}
          />
          <button className="panel-action-btn" onClick={() => fileInputRef.current?.click()}>
            <Plus size={16} /> ファイルを指定
          </button>

          {(["localPath", "serverPath", "url"] as const).map((t) => (
            <button
              key={t}
              className="panel-action-btn"
              onClick={() => setActiveManualInput(activeManualInput === t ? null : t)}
            >
              {t === "localPath" ? <FolderOpen size={16} /> : t === "serverPath" ? <Server size={16} /> : <Globe size={16} />}
              {MANUAL_INPUT_CONFIG[t].label}
            </button>
          ))}

          <AnimatePresence initial={false}>
            {activeManualInput && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 4 }}>
                  <input
                    className="memo-input"
                    placeholder={MANUAL_INPUT_CONFIG[activeManualInput].placeholder}
                    value={pathInputValue}
                    onChange={(e) => setPathInputValue(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleManualSubmit(); }}
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="panel-action-btn secondary" style={{ flex: 1 }} onClick={closeManualInput}>キャンセル</button>
                    <button
                      className="panel-action-btn primary"
                      style={{ flex: 1 }}
                      disabled={!pathInputValue.trim() || pathSubmitting}
                      onClick={handleManualSubmit}
                    >
                      {pathSubmitting ? <Loader2 size={14} className="spin" /> : "確定"}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* ===== 自動入力セクション ===== */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 12 }}>
          <div className="source-section-label">自動入力</div>
          <div className="input-wrapper" style={{ padding: "6px 10px", display: "flex", alignItems: "center", gap: 6, borderRadius: 10 }}>
            <Search size={14} style={{ color: "var(--text-tertiary)", flexShrink: 0 }} />
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearchSubmit(); }}
              placeholder="キーワードでファイル検索"
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "var(--text-primary)", fontSize: 13 }}
            />
            <button
              onClick={handleSearchSubmit}
              disabled={!keyword.trim() || searching}
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--accent-blue)", display: "flex" }}
            >
              {searching ? <Loader2 size={14} className="spin" /> : <Search size={14} />}
            </button>
          </div>

          {searchResults.length > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 160, overflowY: "auto" }}>
              {searchResults.map((r) => (
                <div key={r.path} className="auto-search-result-row">
                  <span className="source-row-name" title={r.path}>{r.file_name}</span>
                  <button
                    className="panel-action-btn primary"
                    style={{ width: "auto", padding: "4px 8px", fontSize: 11, flexShrink: 0, whiteSpace: "nowrap" }}
                    disabled={addingPath === r.path}
                    onClick={() => handleAddCandidate(r)}
                  >
                    {addingPath === r.path ? <Loader2 size={12} className="spin" /> : "+ 追加"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ===== ソース一覧（統合表示） ===== */}
        <div style={{ display: "flex", flexDirection: "column", gap: 2, flex: 1, minHeight: 0, borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 12 }}>
          <div className="source-section-label">ソース一覧</div>
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, minHeight: 0 }}>
            {sources.length === 0 && (
              <p style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "8px 4px" }}>まだソースがありません。</p>
            )}
            {sources.map((s) => {
              const cfg = SOURCE_ICON_MAP[s.type] ?? SOURCE_ICON_MAP.txt;
              return (
                <div key={s.id} className="source-row">
                  <input
                    type="checkbox"
                    checked={s.selected}
                    onChange={(e) => onToggleSelected(s.id, e.target.checked)}
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
          <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>チェックしたソースのみチャットで参照されます</div>
        </div>

        {/* 設定ボタン（左パネル最下部に固定） */}
        <div style={{ borderTop: "1px solid rgba(0,0,0,0.06)", paddingTop: 12 }}>
          <button className="panel-action-btn secondary" onClick={onOpenSettings}>
            <Settings size={16} /> 設定
          </button>
        </div>
      </div>
    </aside>
  );
}

/* ============================
   設定モーダル（watch-paths管理）
   ============================ */
function SettingsModal({ onClose }: { onClose: () => void }) {
  const [currentModel, setCurrentModel] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelLoading, setModelLoading] = useState(true);
  const [modelSwitching, setModelSwitching] = useState(false);
  const [modelMessage, setModelMessage] = useState<{ ok: boolean; text: string } | null>(null);

  // 外部Ollama用ステート
  const [remoteUrl, setRemoteUrl] = useState("");
  const [checkingRemote, setCheckingRemote] = useState(false);
  const [savingRemote, setSavingRemote] = useState(false);
  const [remoteMessage, setRemoteMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const fetchModelSettings = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/model`);
      if (!res.ok) return;
      const data = await res.json();
      setCurrentModel(data.current_model ?? "");
      setAvailableModels(data.available_models ?? []);
      setSelectedModel(data.current_model ?? "");
    } catch (e) {
      console.error("モデル設定取得エラー:", e);
    } finally {
      setModelLoading(false);
    }
  }, []);

  const fetchRemoteUrl = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/remote-url`);
      if (!res.ok) return;
      const data = await res.json();
      setRemoteUrl(data.url ?? "");
    } catch (e) {
      console.error("外部Ollama URL取得エラー:", e);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- モーダルを開いたときの初回フェッチ
    fetchModelSettings();
    fetchRemoteUrl();
  }, [fetchModelSettings, fetchRemoteUrl]);

  const handleSwitchModel = async () => {
    if (!selectedModel || selectedModel === currentModel) return;
    setModelSwitching(true);
    setModelMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings/model`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel }),
      });
      if (!res.ok) {
        setModelMessage({ ok: false, text: "❌ モデルが見つかりません。先に ollama pull してください。" });
        return;
      }
      setCurrentModel(selectedModel);
      setModelMessage({ ok: true, text: `✅ ${selectedModel} に切り替えました` });
    } catch (e) {
      console.error("モデル切り替えエラー:", e);
      setModelMessage({ ok: false, text: "❌ モデルの切り替えに失敗しました。" });
    } finally {
      setModelSwitching(false);
    }
  };

  const handleCheckRemote = async () => {
    setCheckingRemote(true);
    setRemoteMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings/remote-url`);
      if (!res.ok) {
        setRemoteMessage({ ok: false, text: "❌ 接続失敗（URLを確認してください）" });
        return;
      }
      const data = await res.json();
      if (data.connected) {
        setRemoteMessage({ ok: true, text: "✅ 接続成功（モデル一覧を再取得）" });
        await fetchModelSettings();
      } else {
        setRemoteMessage({ ok: false, text: "❌ 接続失敗（URLを確認してください）" });
      }
    } catch (e) {
      console.error("接続確認エラー:", e);
      setRemoteMessage({ ok: false, text: "❌ 接続失敗（URLを確認してください）" });
    } finally {
      setCheckingRemote(false);
    }
  };

  const handleSaveRemote = async () => {
    if (savingRemote) return;
    setSavingRemote(true);
    setRemoteMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/settings/remote-url`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: remoteUrl }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setRemoteMessage({ ok: false, text: `❌ 保存失敗: ${data.detail || "URLを確認してください"}` });
        return;
      }
      setRemoteMessage({ ok: true, text: "✅ 保存しました" });
      await fetchModelSettings();
    } catch (e) {
      console.error("URL保存エラー:", e);
      setRemoteMessage({ ok: false, text: "❌ 保存失敗" });
    } finally {
      setSavingRemote(false);
    }
  };

  const [watchPaths, setWatchPaths] = useState<WatchPath[]>([]);
  const [loading, setLoading] = useState(true);
  const [newPath, setNewPath] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const fetchWatchPaths = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/settings/watch-paths`);
      if (!res.ok) return;
      const data = await res.json();
      setWatchPaths(data.watch_paths ?? []);
    } catch (e) {
      console.error("watch-paths取得エラー:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- モーダルを開いたときの初回フェッチ
    fetchWatchPaths();
  }, [fetchWatchPaths]);

  const handleAdd = async () => {
    if (!newPath.trim() || !newLabel.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/settings/watch-paths`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: newPath.trim(), label: newLabel.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail || "登録に失敗しました");
        return;
      }
      setNewPath("");
      setNewLabel("");
      await fetchWatchPaths();
    } catch (e) {
      setError("登録に失敗しました");
      console.error("watch-path登録エラー:", e);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    setWatchPaths((prev) => prev.filter((w) => w.id !== id));
    try {
      await fetch(`${API_BASE}/api/settings/watch-paths/${id}`, { method: "DELETE" });
    } catch (e) {
      console.error("watch-path削除エラー:", e);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="modal-panel"
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, color: "var(--text-primary)" }}>設定</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", display: "flex" }}>
            <X size={18} style={{ color: "var(--text-secondary)" }} />
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, borderBottom: "1px solid rgba(0,0,0,0.08)", paddingBottom: 16 }}>
          <div className="source-section-label">使用モデル</div>
          {modelLoading ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>読み込み中...</p>
          ) : (
            <>
              <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>現在: {currentModel || "不明"}</p>
              <select
                className="memo-input"
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
              >
                {availableModels.map((m) => (
                  <option key={m} value={m}>
                    {m.startsWith("claude-") 
                      ? `☁️ ${m}（Claude API）` 
                      : m.startsWith("remote/") 
                        ? `🌐 ${m.replace("remote/", "")}（Colab）` 
                        : `💻 ${m}（ローカル）`}
                  </option>
                ))}
              </select>
              {selectedModel.startsWith("claude-") && (
                <div style={{
                  fontSize: 11.5, color: "#ea4335", background: "rgba(234,67,53,0.08)",
                  border: "1px solid rgba(234,67,53,0.25)", borderRadius: 8, padding: "8px 10px",
                  lineHeight: 1.5,
                }}>
                  ⚠️ このモデルを選択すると、チャット内容・参照資料がAnthropicのクラウドAPIへ送信されます。
                  本システムの「完全ローカル・閉域網動作」の前提から外れるため、機密情報の取り扱いに注意してください。
                </div>
              )}
              {selectedModel.startsWith("remote/") && (
                <div style={{
                  fontSize: 11.5, color: "#ea4335", background: "rgba(234,67,53,0.08)",
                  border: "1px solid rgba(234,67,53,0.25)", borderRadius: 8, padding: "8px 10px",
                  lineHeight: 1.5,
                }}>
                  ⚠️ チャット内容が外部サーバー（Google Colab）に送信されます。
                </div>
              )}
              <button
                className="panel-action-btn primary"
                disabled={!selectedModel || selectedModel === currentModel || modelSwitching}
                onClick={handleSwitchModel}
              >
                {modelSwitching ? <Loader2 size={14} className="spin" /> : "切り替える"}
              </button>
              {modelMessage && (
                <div style={{ fontSize: 12, color: modelMessage.ok ? "#34a853" : "#ea4335" }}>{modelMessage.text}</div>
              )}
              <p style={{ fontSize: 11, color: "var(--text-tertiary)" }}>※切り替え後は応答に反映されます</p>
            </>
          )}

          {/* 外部Ollama URL設定セクション */}
          <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 14, marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="source-section-label">外部Ollama（Google Colab等）</div>
            <input
              className="memo-input"
              placeholder="https://xxxx.ngrok-free.app"
              value={remoteUrl}
              onChange={(e) => setRemoteUrl(e.target.value)}
            />
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="panel-action-btn secondary"
                style={{ flex: 1 }}
                disabled={checkingRemote}
                onClick={handleCheckRemote}
              >
                {checkingRemote ? <Loader2 size={14} className="spin" /> : "接続確認"}
              </button>
              <button
                className="panel-action-btn primary"
                style={{ flex: 1 }}
                disabled={savingRemote}
                onClick={handleSaveRemote}
              >
                {savingRemote ? <Loader2 size={14} className="spin" /> : "保存"}
              </button>
            </div>
            {remoteMessage && (
              <div style={{ fontSize: 12, color: remoteMessage.ok ? "#34a853" : "#ea4335" }}>{remoteMessage.text}</div>
            )}
          </div>
        </div>

        <div className="source-section-label" style={{ marginBottom: 8 }}>自動検索対象PATH</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 }}>
          {loading ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>読み込み中...</p>
          ) : watchPaths.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--text-tertiary)" }}>登録済みのPATHはありません。</p>
          ) : (
            watchPaths.map((w) => (
              <div key={w.id} className="watch-path-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "var(--text-primary)" }}>{w.label}</div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{w.path}</div>
                </div>
                <button className="source-row-delete" onClick={() => handleDelete(w.id)} title="削除">
                  <Trash2 size={14} />
                </button>
              </div>
            ))
          )}
        </div>

        <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="source-section-label">+ PATHを追加</div>
          <input
            className="memo-input"
            placeholder="表示名（ラベル）"
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
          />
          <input
            className="memo-input"
            placeholder="コンテナ内パス（例: /mnt/watch_roots/xxx）"
            value={newPath}
            onChange={(e) => setNewPath(e.target.value)}
          />
          {error && <div style={{ color: "#ea4335", fontSize: 12 }}>{error}</div>}
          <button
            className="panel-action-btn primary"
            disabled={!newPath.trim() || !newLabel.trim() || submitting}
            onClick={handleAdd}
          >
            {submitting ? <Loader2 size={14} className="spin" /> : "追加"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ============================
   出力パネル（RIGHT、旧Studioパネル）
   ============================ */
const OUTPUT_PRESETS: { key: string; format: OutputFormat | null; icon: React.ReactNode; label: string }[] = [
  { key: "excel", format: "excel", icon: <FileSpreadsheet size={20} />, label: "エクセル出力" },
  { key: "word", format: "word", icon: <FileText size={20} />, label: "ワード出力" },
  { key: "powerpoint", format: "powerpoint", icon: <Presentation size={20} />, label: "パワーポイント出力" },
  { key: "custom-1", format: null, icon: "＋", label: "カスタム追加" },
  { key: "custom-2", format: null, icon: "＋", label: "カスタム追加" },
  { key: "custom-3", format: null, icon: "＋", label: "カスタム追加" },
];

const OUTPUT_FORMAT_ICON: Record<OutputFormat, { icon: React.ReactNode; color: string }> = {
  excel: { icon: <FileSpreadsheet size={16} />, color: "#34a853" },
  word: { icon: <FileText size={16} />, color: "#4285f4" },
  powerpoint: { icon: <Presentation size={16} />, color: "#ea4335" },
};

function OutputResultRow({ file }: { file: OutputFileRecord }) {
  const cfg = OUTPUT_FORMAT_ICON[file.format] ?? { icon: <FileText size={16} />, color: "var(--text-secondary)" };
  return (
    <div className="output-file-row">
      <span style={{ color: cfg.color, display: "flex", flexShrink: 0 }}>{cfg.icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="output-file-name">{file.file_name}</div>
        <div className="output-file-size">{file.created_at}</div>
      </div>
      <a href={`${API_BASE}${file.download_url}`} download className="output-file-dl" title="ダウンロード">
        <Download size={14} />
      </a>
    </div>
  );
}

function StudioPanel({
  tab,
  onTabChange,
  sessionId,
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
  sessionId: string;
  draftTitle: string;
  draftContent: string;
  onDraftTitleChange: (v: string) => void;
  onDraftContentChange: (v: string) => void;
  drafts: MemoDraft[];
  onSelectDraft: (d: MemoDraft) => void;
  onConvertDraft: () => void;
  onNewDraft: () => void;
}) {
  const [outputFiles, setOutputFiles] = useState<OutputFileRecord[]>([]);
  const [generatingFormats, setGeneratingFormats] = useState<Set<OutputFormat>>(new Set());

  const fetchOutputFiles = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/output/files?session_id=${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const data = await res.json();
      setOutputFiles(data.files ?? []);
    } catch (e) {
      console.error("出力ファイル一覧取得エラー:", e);
    }
  }, [sessionId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- session_id変更時の出力ファイル再取得
    fetchOutputFiles();
  }, [fetchOutputFiles]);

  const handleGenerate = async (format: OutputFormat) => {
    setGeneratingFormats((prev) => new Set(prev).add(format));
    try {
      const res = await fetch(`${API_BASE}/api/output/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, format }),
      });
      if (res.ok) {
        await fetchOutputFiles();
      } else {
        console.error("出力生成失敗:", res.status);
      }
    } catch (e) {
      console.error("出力生成エラー:", e);
    } finally {
      setGeneratingFormats((prev) => {
        const next = new Set(prev);
        next.delete(format);
        return next;
      });
    }
  };

  return (
    <aside style={{
      width: 320, flexShrink: 0, display: "flex", flexDirection: "column",
      borderLeft: "1px solid rgba(0,0,0,0.08)", background: "var(--bg-sidebar)", overflow: "hidden",
    }}>
      <div style={{ display: "flex", borderBottom: "1px solid rgba(0,0,0,0.08)", flexShrink: 0 }}>
        <button className={`tab-btn${tab === "studio" ? " active" : ""}`} onClick={() => onTabChange("studio")}>出力</button>
        <button className={`tab-btn${tab === "memo" ? " active" : ""}`} onClick={() => onTabChange("memo")}>メモ</button>
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: 16, minHeight: 0 }}>
        {tab === "studio" ? (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10, marginBottom: 22 }}>
              {OUTPUT_PRESETS.map((p) => {
                const isGenerating = p.format !== null && generatingFormats.has(p.format);
                return (
                  <button
                    key={p.key}
                    className={`preset-card${p.format === null ? " placeholder" : ""}`}
                    disabled={isGenerating}
                    onClick={() => { if (p.format !== null) handleGenerate(p.format); }}
                  >
                    <span style={{ color: "var(--accent-blue)" }}>{isGenerating ? <Loader2 size={20} className="spin" /> : p.icon}</span>
                    <span>{p.label}</span>
                  </button>
                );
              })}
            </div>

            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.3px" }}>
              出力結果
            </div>
            {outputFiles.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>まだ生成されたファイルはありません。</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {outputFiles.map((f) => (
                  <OutputResultRow key={f.file_id} file={f} />
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

            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text-tertiary)", marginTop: 12, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.3px" }}>
              保存済みメモ
            </div>
            {drafts.length === 0 ? (
              <p style={{ fontSize: 12, color: "var(--text-tertiary)" }}>メモはまだありません。</p>
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
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [sessionId, setSessionId] = useState(() => Date.now().toString());
  const bottomRef = useRef<HTMLDivElement>(null);

  // ソースパネル
  const [sources, setSources] = useState<Source[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Studioパネル（出力パネル）
  const [studioTab, setStudioTab] = useState<StudioTab>("studio");
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

  const handleAddPath = useCallback(async (path: string, label: string, sourceType: "local_path" | "server_path" | "auto_search") => {
    try {
      const res = await fetch(`${API_BASE}/api/sources/from-path`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, label, source_type: sourceType }),
      });
      if (!res.ok) {
        console.error("パス参照ソース追加失敗:", res.status);
        return false;
      }
      await fetchSources();
      return true;
    } catch (e) {
      console.error("パス参照ソース追加エラー:", e);
      return false;
    }
  }, [fetchSources]);

  const handleAddUrl = useCallback(async (url: string, label: string) => {
    try {
      const res = await fetch(`${API_BASE}/api/sources/from-url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, label }),
      });
      if (!res.ok) {
        console.error("URLソース追加失敗:", res.status);
        return false;
      }
      await fetchSources();
      return true;
    } catch (e) {
      console.error("URLソース追加エラー:", e);
      return false;
    }
  }, [fetchSources]);

  const handleAutoSearch = useCallback(async (keyword: string): Promise<AutoSearchResult[]> => {
    try {
      const res = await fetch(`${API_BASE}/api/sources/auto-search?keyword=${encodeURIComponent(keyword)}`);
      if (!res.ok) return [];
      const data = await res.json();
      return data.results ?? [];
    } catch (e) {
      console.error("自動検索エラー:", e);
      return [];
    }
  }, []);

  const handleAddAutoSearchCandidate = useCallback(async (result: AutoSearchResult) => {
    return handleAddPath(result.path, result.file_name, "auto_search");
  }, [handleAddPath]);

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

  // AI応答受信後、次のプロンプト候補をバックグラウンドで取得する（awaitしない・UXを止めない）。
  // 失敗時や応答が遅い間は、直前の suggestions をそのまま表示し続ける（ちらつき防止）。
  const fetchSuggestions = useCallback((lastUserMessage: string, lastAiResponse: string) => {
    fetch(`${API_BASE}/api/chat/suggestions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        last_user_message: lastUserMessage,
        last_ai_response: lastAiResponse,
        session_id: sessionId,
      }),
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.suggestions?.length) setSuggestions(data.suggestions);
      })
      .catch((e) => console.error("提案プロンプト取得エラー:", e));
  }, [sessionId]);

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
          <div style="font-family: sans-serif; color: var(--text-primary); background: #ffffff; padding: 20px; border-radius: 12px; border: 1px solid rgba(0,0,0,0.08);">
            <h3 style="margin-top: 0; color: var(--accent-blue);">📊 損益比較分析ダッシュボード (DEMO)</h3>
            <p style="font-size: 13px; color: var(--text-secondary);">PDF: ${capturedFile.name} の解析結果</p>
            <div style="margin: 20px 0; border: 1px dashed rgba(0,0,0,0.2); padding: 15px; border-radius: 8px;">
              <span style="font-size: 24px; font-weight: bold; color: #34a853;">¥12,450,000</span>
              <span style="font-size: 12px; color: var(--text-secondary); margin-left: 10px;">当月想定粗利益</span>
            </div>
            <p style="font-size: 12px; color: var(--text-tertiary); text-align: right;">※デモモード用のモック表示です</p>
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
      fetchSuggestions(content, res.content);
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

      // 2. PDFなし：通常のチャット対話RAG APIの呼び出し
      // ※ファイル生成は右パネル「出力」から /api/output/generate を呼ぶ方式に一本化したため、
      //   チャットのキーワード検出によるファイル自動生成は行わない。

      // 3. データベース連携（NL2SQL）の判定
      // プロンプトテンプレート（見積作成用等）はDB系キーワードを多数含むため誤起動しやすい。
      // shouldUseNl2sql() でテンプレート特有のフレーズ・長文を除外し、厳格化している。
      const isDbQuery = shouldUseNl2sql(content);

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
              : `<div style="color: var(--text-secondary); padding: 10px; font-style: italic;">該当するデータが見つかりませんでした。</div>`;

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
      const selectedSourceIds = sources.filter((s) => s.selected).map((s) => s.id);
      setThinkingLabel(shouldUseRag(content, selectedSourceIds) ? "社内ナレッジをRAG検索中..." : "AIが回答中...");

      const resChat = await fetch(`${API_BASE}/api/chat/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          session_id: sessionId,
          mode: role === "admin" ? "internal" : "proposal",
          source_mode: "manual",
          selected_source_ids: selectedSourceIds,
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
          citations: data.citations && data.citations.length > 0 ? data.citations : undefined,
          timestamp: new Date(),
        },
      ]);
      fetchSuggestions(content, data.answer);

    } catch (e) {
      console.error(e);
      setMessages((p) => [
        ...p,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: "申し訳ありません。ローカルAI APIとの接続に失敗しました。FastAPIコンテナ（localhost:3101）が起動しているか確認してください。",
          timestamp: new Date(),
        },
      ]);
    }

    setThinkingLabel("");
    setGenerating(false);
  }, [input, generating, role, attachedFile, demoMode, sessionId, sources, fetchSuggestions]);

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setAttachedFile(null);
    setSessionId(Date.now().toString());
  };

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

  const lastAssistantId = messages.filter((m) => m.role === "assistant").at(-1)?.id;

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
        borderBottom: "1px solid rgba(0,0,0,0.08)",
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <GeniusLogo size={26} />
          <span style={{ fontWeight: 700, fontSize: 16, color: "var(--accent-blue)", letterSpacing: "0.5px" }}>AVITO</span>
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
          onUploadFile={handleUploadSource}
          onAddPath={handleAddPath}
          onAddUrl={handleAddUrl}
          onToggleSelected={handleToggleSelected}
          onDelete={handleDeleteSource}
          onAutoSearch={handleAutoSearch}
          onAddAutoSearchCandidate={handleAddAutoSearchCandidate}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {/* CENTER: チャットパネル */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
          <div className="chat-scroll" style={{ display: "flex", flexDirection: "column" }}>
            {messages.length === 0 && !generating ? (
              <WelcomeView />
            ) : (
              <div style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "32px 24px 0" }}>
                <AnimatePresence>
                  {messages.map((msg) => (
                    <MessageBubble
                      key={msg.id}
                      message={msg}
                      isLatestAssistant={msg.id === lastAssistantId}
                      suggestions={suggestions}
                      onSaveMemo={handleSaveMessageToMemo}
                      onFeedback={handleFeedback}
                      onSuggestClick={setInput}
                    />
                  ))}
                </AnimatePresence>
                <AnimatePresence>
                  {generating && <GeneratingIndicator label={thinkingLabel} />}
                </AnimatePresence>
                <div ref={bottomRef} style={{ height: 8 }} />
              </div>
            )}
          </div>

          {messages.length === 0 && (
            <div style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "0 24px" }}>
              <PromptTemplateGrid onPick={(text) => setInput(text)} />
            </div>
          )}

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

        {/* RIGHT: 出力パネル */}
        <StudioPanel
          tab={studioTab}
          onTabChange={setStudioTab}
          sessionId={sessionId}
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

      <AnimatePresence>
        {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      </AnimatePresence>
    </div>
  );
}
