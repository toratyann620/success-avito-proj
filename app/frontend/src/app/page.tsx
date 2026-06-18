"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, MessageSquare, Trash2,
  Mic, Paperclip, Send, ChevronDown,
  Shield, User, Settings, HelpCircle,
  PanelLeftClose, PanelLeftOpen, X,
} from "lucide-react";
import type { Message, UserRole, HistoryItem } from "@/app/lib/mockData";
import { getMockResponse, initialHistory, quickPrompts, THINKING_PHASES } from "@/app/lib/mockData";
import { MessageBubble, GeneratingIndicator, GeniusLogo } from "@/app/components/MessageBubble";

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
      {/* ラベル */}
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

      {/* トグルスイッチ */}
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
   サイドバー
   ============================ */
function Sidebar({
  open,
  history,
  currentId,
  onNewChat,
  onSelectHistory,
}: {
  open: boolean;
  history: HistoryItem[];
  currentId: string | null;
  onNewChat: () => void;
  onSelectHistory: (id: string) => void;
}) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.nav
          key="sidebar"
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 256, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeInOut" }}
          style={{
            flexShrink: 0,
            overflow: "hidden",
            background: "var(--bg-sidebar)",
            display: "flex",
            flexDirection: "column",
            height: "100%",
          }}
        >
          <div style={{ padding: "12px 8px", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>

            {/* トップ: ハンバーガー + ロゴ */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 8px", marginBottom: 8 }}>
              <GeniusLogo size={28} />
              <div style={{ display: "flex", flexDirection: "column", marginLeft: 2 }}>
                <span style={{ fontSize: 12, color: "#8ab4f8", fontWeight: 700, letterSpacing: "0.5px" }}>AVITO</span>
                <span style={{ fontSize: 10, color: "#e3e3e3", fontWeight: 500, letterSpacing: "-0.2px", lineHeight: 1.2 }}>AI-driven Value into Transformative Org</span>
              </div>
            </div>

            {/* 新規チャット */}
            <button className="new-chat-btn" onClick={onNewChat} style={{ marginBottom: 16 }}>
              <Plus size={18} />
              <span>新しいチャット</span>
            </button>

            {/* 最近の会話 */}
            <div style={{ fontSize: 12, fontWeight: 600, color: "#6e6e6e", padding: "0 12px", marginBottom: 6, letterSpacing: "0.3px", textTransform: "uppercase" }}>
              最近の会話
            </div>

            {/* 履歴リスト */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 2, minHeight: 0 }}>
              {history.map((item) => (
                <div
                  key={item.id}
                  className={`sidebar-item${currentId === item.id ? " active" : ""}`}
                  onClick={() => onSelectHistory(item.id)}
                  style={{ justifyContent: "space-between" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, overflow: "hidden" }}>
                    <MessageSquare size={15} style={{ flexShrink: 0, color: "#6e6e6e" }} />
                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {item.title}
                    </span>
                  </div>
                  <Trash2 size={14} style={{ color: "#6e6e6e", flexShrink: 0, opacity: 0 }} className="trash-icon" />
                </div>
              ))}
            </div>

            {/* ボトム: 設定 */}
            <div style={{ paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", flexDirection: "column", gap: 2 }}>
              <div className="sidebar-item" style={{ gap: 10 }}>
                <Settings size={18} style={{ color: "#6e6e6e" }} />
                <span style={{ fontSize: 13 }}>設定</span>
              </div>
              <div className="sidebar-item" style={{ gap: 10 }}>
                <HelpCircle size={18} style={{ color: "#6e6e6e" }} />
                <span style={{ fontSize: 13 }}>ヘルプ</span>
              </div>
            </div>
          </div>
        </motion.nav>
      )}
    </AnimatePresence>
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
      paddingBottom: 160,
      paddingLeft: 24,
      paddingRight: 24,
    }}>
      {/* タイトルロゴ + 挨拶 */}
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
          fontSize: 36,
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
        <p style={{ fontSize: 36, fontWeight: 600, color: "#6e6e6e" }}>
          何かお手伝いできることはありますか？
        </p>
      </motion.div>

      {/* サジェストチップ（2×2グリッド） */}
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
        /* 波形アニメーション */
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
   入力エリア
   ============================ */
function InputArea({
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

  const handleMic = async () => {
    setRecording((v) => !v);
    if (!recording) {
      setTimeout(() => setRecording(false), 4000);
    }
  };

  return (
    <div style={{
      position: "sticky",
      bottom: 0,
      width: "100%",
      background: "var(--bg-base)",
      paddingTop: 12,
      paddingBottom: 20,
    }}>
      <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 16px" }}>
        {/* 添付ファイル表示 */}
        <AnimatePresence>
          {attachedFile && (
            <AttachedFileBadge name={attachedFile.name} onRemove={onRemoveFile} />
          )}
        </AnimatePresence>

        {/* 入力ボックス */}
        <div className="input-wrapper" style={{ padding: "12px 16px" }}>
          {/* テキストエリア */}
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

          {/* ボタン行 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            {/* 左: クリップ・マイク */}
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
              <motion.button
                whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                onClick={handleMic}
                style={{
                  width: 36, height: 36, borderRadius: "50%",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  background: recording ? "linear-gradient(135deg,#ea4335,#c62828)" : "transparent",
                  border: "none", cursor: "pointer",
                }}
              >
                <Mic size={18} style={{ color: recording ? "white" : "#ababab" }} />
              </motion.button>
            </div>

            {/* 右: 送信ボタン */}
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

        {/* フッター注記 */}
        <p style={{ textAlign: "center", fontSize: 12, color: "#4b4b4b", marginTop: 8 }}>
          本システムは RAG基盤で社内ナレッジ847件を参照しています
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
function formatDbResultsToHtml(results: any[], sql: string, durationMs: number): string {
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
   メインページ
   ============================ */
export default function Page() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput]       = useState("");
  const [role, setRole]         = useState<UserRole>("admin");
  const [demoMode, setDemoMode] = useState(false);
  const [sidebarOpen, setSidebar] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [thinkingLabel, setThinkingLabel] = useState("");
  const [history, setHistory]   = useState<HistoryItem[]>(initialHistory);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, generating, thinkingLabel]);

  const handleSend = useCallback(async (text?: string) => {
    const content = (text ?? input).trim();
    const hasPdf = !!attachedFile;

    // PDFも入力テキストもない場合はスキップ
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

    const sessionId = currentId || Date.now().toString();

    // 初回メッセージ時に履歴追加
    if (messages.length === 0) {
      setCurrentId(sessionId);
      setHistory((p) => [
        { id: sessionId, title: displayContent.slice(0, 22) + (displayContent.length > 22 ? "…" : ""), timestamp: new Date() },
        ...p,
      ]);
    }

    const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

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

        // デモ用モックダッシュボードを表示
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

        const res = await fetch(`${apiBase}/api/chat/analyze-pdf`, {
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

      // 文書生成APIを呼び出し
      if (apiDocType) {
        setThinkingLabel(`${apiDocType.toUpperCase()}ファイルを自動作成中...`);
        try {
          const resDoc = await fetch(`${apiBase}/api/documents/generate`, {
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
          const resDb = await fetch(`${apiBase}/api/db/query`, {
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
          // エラー時は通常のRAGにフォールバックさせず、エラー通知として処理を終える
        }
      }

      // チャット対話RAG APIの呼び出し
      setThinkingLabel("社内ナレッジをRAG検索中...");
      
      const resChat = await fetch(`${apiBase}/api/chat/`, {
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
      
      // 出典元の整理
      const sourcesText = data.sources && data.sources.length > 0 
        ? "\n\n**【参照ドキュメント】**\n" + data.sources.map((s: any) => `📄 ${s.file_name || s.doc_id}`).join("\n")
        : "";

      setMessages((p) => [
        ...p,
        {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: data.answer + sourcesText,
          fileChip: fileChipData,
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
  }, [input, generating, messages.length, role, attachedFile, demoMode, currentId]);

  const handleNewChat = () => {
    setMessages([]);
    setInput("");
    setCurrentId(null);
    setAttachedFile(null);
  };

  if (!isLoggedIn) {
    return <LoginScreen onLogin={() => setIsLoggedIn(true)} />;
  }

  return (
    <div style={{ display: "flex", height: "100vh", width: "100vw", background: "var(--bg-base)", overflow: "hidden" }}>

      {/* ===== サイドバー ===== */}
      <Sidebar
        open={sidebarOpen}
        history={history}
        currentId={currentId}
        onNewChat={handleNewChat}
        onSelectHistory={(id) => setCurrentId(id)}
      />

      {/* ===== メインカラム ===== */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

        {/* ===== ヘッダー ===== */}
        <header style={{
          height: 56,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 16px",
          flexShrink: 0,
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          {/* 左: トグル + モデル名 */}
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <motion.button
              whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
              onClick={() => setSidebar((v) => !v)}
              style={{
                width: 40, height: 40, borderRadius: "50%",
                display: "flex", alignItems: "center", justifyContent: "center",
                background: "transparent", border: "none", cursor: "pointer",
              }}
            >
              {sidebarOpen
                ? <PanelLeftClose size={20} style={{ color: "#ababab" }} />
                : <PanelLeftOpen  size={20} style={{ color: "#ababab" }} />}
            </motion.button>

            {/* モデルセレクタ */}
            <button className="model-selector">
              <span style={{ fontWeight: 600, fontSize: 14 }}>AVITO v2.0</span>
              <ChevronDown size={16} style={{ color: "#ababab" }} />
            </button>
          </div>

          {/* 右: トグル類 */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <DemoToggle demoMode={demoMode} onToggle={() => setDemoMode(!demoMode)} />
            <RoleToggle 
              role={role} 
              onToggle={() => {
                setRole(role === "admin" ? "user" : "admin");
                handleNewChat(); // 権限切り替え時にチャットをリセット
              }} 
            />
          </div>
        </header>

        {/* ===== チャット or ウェルカム ===== */}
        <div
          className="chat-scroll"
          style={{ display: "flex", flexDirection: "column" }}
        >
          {messages.length === 0 && !generating ? (
            <WelcomeView onPrompt={(p) => handleSend(p)} />
          ) : (
            <div style={{ maxWidth: 720, width: "100%", margin: "0 auto", padding: "32px 24px 0" }}>
              <AnimatePresence>
                {messages.map((msg) => (
                  <MessageBubble key={msg.id} message={msg} />
                ))}
              </AnimatePresence>
              <AnimatePresence>
                {generating && <GeneratingIndicator label={thinkingLabel} />}
              </AnimatePresence>
              <div ref={bottomRef} style={{ height: 180 }} />
            </div>
          )}
        </div>

      {/* ===== 入力エリア (チャット中は固定) ===== */}
        {messages.length > 0 || generating ? (
          <div style={{
            position: "sticky",
            bottom: 0,
            background: "var(--bg-base)",
            padding: "12px 0 20px",
            flexShrink: 0,
          }}>
            <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 24px" }}>
              <AnimatePresence>
                {attachedFile && (
                  <AttachedFileBadge name={attachedFile.name} onRemove={() => setAttachedFile(null)} />
                )}
              </AnimatePresence>
              <div className="input-wrapper" style={{ padding: "12px 16px" }}>
                <textarea
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    e.target.style.height = "auto";
                    e.target.style.height = Math.min(e.target.scrollHeight, 160) + "px";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={attachedFile ? "PDFについて質問する（空欄でも分析開始）" : "フォローアップ of 質問を入力..."}
                  rows={1}
                  style={{
                    width: "100%", background: "transparent", border: "none",
                    outline: "none", resize: "none", color: "#e3e3e3",
                    fontSize: 15, lineHeight: "1.6", maxHeight: 160,
                    overflowY: "auto", display: "block", marginBottom: 10,
                  }}
                />
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ display: "flex", gap: 4 }}>
                    {/* PDF添付ボタン */}
                    <input
                      type="file" accept=".pdf" style={{ display: "none" }}
                      id="chat-file-input"
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) setAttachedFile(f);
                        e.target.value = "";
                      }}
                    />
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                      onClick={() => document.getElementById("chat-file-input")?.click()}
                      style={{
                        width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                        background: attachedFile ? "rgba(138,180,248,0.15)" : "transparent", border: "none", cursor: "pointer",
                      }}
                      title="PDFを添付"
                    >
                      <Paperclip size={18} style={{ color: attachedFile ? "#8ab4f8" : "#ababab" }} />
                    </motion.button>
                    <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                      style={{ width: 36, height: 36, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "none", cursor: "pointer" }}>
                      <Mic size={18} style={{ color: "#ababab" }} />
                    </motion.button>
                  </div>
                  <motion.button
                    onClick={() => handleSend()}
                    disabled={(!input.trim() && !attachedFile) || generating}
                    whileHover={(input.trim() || attachedFile) && !generating ? { scale: 1.08 } : {}}
                    whileTap={(input.trim() || attachedFile) && !generating ? { scale: 0.92 } : {}}
                    style={{
                      width: 36, height: 36, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center",
                      background: (input.trim() || attachedFile) && !generating ? "linear-gradient(135deg,#4285f4,#9b59b6)" : "rgba(255,255,255,0.08)",
                      border: "none", cursor: (input.trim() || attachedFile) && !generating ? "pointer" : "not-allowed",
                      transition: "background 0.2s",
                    }}
                  >
                    <Send size={16} style={{ color: (input.trim() || attachedFile) && !generating ? "white" : "#6e6e6e" }} />
                  </motion.button>
                </div>
              </div>
              <p style={{ textAlign: "center", fontSize: 12, color: "#4b4b4b", marginTop: 8 }}>
                本システムは RAG基盤で社内ナレッジ847件を参照しています
              </p>
            </div>
          </div>
        ) : (
          /* ウェルカム時の入力エリア */
          <div style={{ flexShrink: 0 }}>
            <InputArea
              value={input}
              onChange={setInput}
              onSend={handleSend}
              disabled={generating}
              attachedFile={attachedFile}
              onAttachFile={setAttachedFile}
              onRemoveFile={() => setAttachedFile(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}
