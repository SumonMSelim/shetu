"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { ChatStreamEvent } from "@/lib/agent/stream-protocol";
import { Markdown } from "@/components/Markdown";

type Msg = { role: "user" | "assistant"; content: string };
type VaultDocRef = { docId: string; fileName: string };
type ConvRef = { convId: string; title: string; updatedAt: string };

const STARTERS = [
  { title: "Am I ready?", prompt: "I want to study abroad for a master's. Please check how ready I am and tell me what I need to improve. I will share my background." },
  { title: "What is the real cost?", prompt: "What does it really cost to study abroad for one year? Please give me a full, clear list: tuition, living costs, insurance, and the visa money I must show." },
  { title: "Find scholarships for me", prompt: "What scholarships can I really apply for? Please tell me which ones pay full tuition and which pay only a part." },
  { title: "Is this agency offer real?", prompt: "An agency told me they can guarantee my admission and visa, and get me a scholarship if I pay a big fee first. Is this real or a trick?" },
  { title: "Make my statement better", prompt: "I want help to improve my statement of purpose. What makes a strong one, and how should I begin?" },
  { title: "Help me with IELTS", prompt: "I need to prepare for IELTS. Please explain the bands in simple words and give me one short writing task at my level." },
];

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [convId, setConvId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ConvRef[]>([]);
  const [attachedDoc, setAttachedDoc] = useState<VaultDocRef | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeTool]);

  const loadConversations = useCallback(async () => {
    try {
      const r = await fetch("/api/conversations");
      if (!r.ok) return;
      const d = (await r.json()) as { conversations?: ConvRef[] };
      setConversations(d.conversations ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const openConversation = useCallback(async (id: string) => {
    if (streaming) return;
    setError(null);
    try {
      const r = await fetch(`/api/conversations?convId=${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error("Could not open this conversation.");
      const d = (await r.json()) as { messages?: Msg[] };
      setMessages(d.messages ?? []);
      setConvId(id);
      setAttachedDoc(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open conversation.");
    }
  }, [streaming]);

  const newChat = useCallback(() => {
    if (streaming) return;
    setMessages([]);
    setConvId(null);
    setAttachedDoc(null);
    setError(null);
  }, [streaming]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);

      const docId = attachedDoc?.docId;
      const shownContent = attachedDoc ? `📎 ${attachedDoc.fileName}\n\n${trimmed}` : trimmed;
      setMessages((prev) => [...prev, { role: "user", content: shownContent }, { role: "assistant", content: "" }]);
      setInput("");
      setAttachedDoc(null);
      setStreaming(true);
      setActiveTool(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, convId: convId ?? undefined, docId }),
        });
        if (!res.ok || !res.body) {
          throw new Error(res.status === 401 ? "Your session has ended. Please sign in again." : "Request failed.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let gotText = false;

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            const event = JSON.parse(line) as ChatStreamEvent;
            if (event.kind === "meta") {
              setConvId(event.convId);
            } else if (event.kind === "text") {
              gotText = true;
              setActiveTool(null);
              setMessages((prev) => {
                const copy = [...prev];
                copy[copy.length - 1] = {
                  role: "assistant",
                  content: copy[copy.length - 1].content + event.text,
                };
                return copy;
              });
            } else if (event.kind === "tool") {
              setActiveTool(event.label);
            } else if (event.kind === "error") {
              setError(event.message);
            }
          }
        }
        if (gotText) void loadConversations();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setStreaming(false);
        setActiveTool(null);
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && last.content === "") return prev.slice(0, -1);
          return prev;
        });
      }
    },
    [streaming, attachedDoc, convId, loadConversations],
  );

  const empty = messages.length === 0;

  return (
    <div style={{ display: "flex", height: "calc(100vh - 60px)" }}>
      <Sidebar
        conversations={conversations}
        activeConvId={convId}
        onNew={newChat}
        onOpen={openConversation}
      />

      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto" }}>
          <div className="container" style={{ paddingTop: 28, paddingBottom: 20, maxWidth: 820 }}>
            {empty ? (
              <EmptyState onPick={send} />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                {messages.map((m, i) => (
                  <Bubble key={i} role={m.role} content={m.content} />
                ))}
                {activeTool && <ThinkingRow label={activeTool} />}
              </div>
            )}
            {error && (
              <div
                className="card"
                style={{ marginTop: 16, padding: 14, borderColor: "#f0c9b4", background: "var(--accent-soft)", color: "var(--warn)" }}
              >
                {error}
              </div>
            )}
          </div>
        </div>

        <Composer
          value={input}
          onChange={setInput}
          onSend={() => send(input)}
          disabled={streaming}
          attachedDoc={attachedDoc}
          onAttachDoc={setAttachedDoc}
          onError={setError}
        />
      </div>
    </div>
  );
}

function Sidebar({
  conversations,
  activeConvId,
  onNew,
  onOpen,
}: {
  conversations: ConvRef[];
  activeConvId: string | null;
  onNew: () => void;
  onOpen: (id: string) => void;
}) {
  return (
    <aside
      style={{
        width: 260,
        flexShrink: 0,
        borderRight: "1px solid var(--border)",
        background: "var(--surface)",
        display: "flex",
        flexDirection: "column",
      }}
      className="shetu-sidebar"
    >
      <div style={{ padding: 14 }}>
        <button className="btn btn-primary" onClick={onNew} style={{ width: "100%", justifyContent: "center" }}>
          + New chat
        </button>
      </div>
      <div style={{ overflowY: "auto", padding: "0 10px 14px" }}>
        <div className="muted" style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.4, padding: "6px 8px" }}>
          Your chats
        </div>
        {conversations.length === 0 ? (
          <div className="muted" style={{ fontSize: 13, padding: "4px 8px" }}>
            No chats yet.
          </div>
        ) : (
          conversations.map((c) => (
            <button
              key={c.convId}
              onClick={() => onOpen(c.convId)}
              title={c.title}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                background: c.convId === activeConvId ? "var(--bg)" : "transparent",
                border: "none",
                borderRadius: 8,
                padding: "9px 10px",
                fontSize: 13.5,
                color: "var(--text)",
                cursor: "pointer",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {c.title}
            </button>
          ))
        )}
      </div>
      <style>{`
        @media (max-width: 720px) { .shetu-sidebar { display: none; } }
      `}</style>
    </aside>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div>
      <h1 style={{ fontSize: 28, margin: "6px 0 6px" }}>How can I help you today?</h1>
      <p className="muted" style={{ margin: "0 0 24px", fontSize: 16 }}>
        Ask me anything about studying abroad. Pick a starting point below, or just type your
        question in your own words.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: 12 }}>
        {STARTERS.map((s) => (
          <button
            key={s.title}
            className="card"
            onClick={() => onPick(s.prompt)}
            style={{ textAlign: "left", padding: 16, background: "var(--surface)", border: "1px solid var(--border)" }}
          >
            <div style={{ fontWeight: 700, marginBottom: 6 }}>{s.title}</div>
            <div className="muted" style={{ fontSize: 13.5, lineHeight: 1.5 }}>
              {s.prompt.length > 96 ? s.prompt.slice(0, 96) + "…" : s.prompt}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function Bubble({ role, content }: { role: "user" | "assistant"; content: string }) {
  const isUser = role === "user";
  return (
    <div style={{ display: "flex", justifyContent: isUser ? "flex-end" : "flex-start" }}>
      <div
        style={{
          maxWidth: "88%",
          padding: "12px 16px",
          borderRadius: 16,
          lineHeight: 1.6,
          fontSize: 15.5,
          background: isUser ? "var(--primary)" : "var(--surface)",
          color: isUser ? "#fff" : "var(--text)",
          border: isUser ? "none" : "1px solid var(--border)",
          boxShadow: isUser ? "none" : "var(--shadow)",
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
          ...(isUser ? { whiteSpace: "pre-wrap" as const } : {}),
        }}
      >
        {isUser ? content : content ? <Markdown>{content}</Markdown> : "…"}
      </div>
    </div>
  );
}

function ThinkingRow({ label }: { label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 14, paddingLeft: 4 }}>
      <span className="shetu-dots" aria-hidden="true">
        <i /> <i /> <i />
      </span>
      {label}…
      <style>{`
        .shetu-dots { display: inline-flex; gap: 4px; }
        .shetu-dots i { width: 6px; height: 6px; border-radius: 50%; background: var(--primary); display: inline-block; animation: shetuPulse 1s infinite ease-in-out; }
        .shetu-dots i:nth-child(2) { animation-delay: 0.15s; }
        .shetu-dots i:nth-child(3) { animation-delay: 0.3s; }
        @keyframes shetuPulse { 0%, 100% { opacity: 0.3; transform: translateY(0); } 50% { opacity: 1; transform: translateY(-2px); } }
      `}</style>
    </div>
  );
}

const DOC_EXT = /\.(pdf|docx?|txt|md)$/i;

function Composer({
  value,
  onChange,
  onSend,
  disabled,
  attachedDoc,
  onAttachDoc,
  onError,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  attachedDoc: VaultDocRef | null;
  onAttachDoc: (d: VaultDocRef | null) => void;
  onError: (m: string | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  // Upload a file straight from the chat. It is stored in the Vault (one source
  // of truth) and then attached to the next message for review.
  const upload = useCallback(
    async (file: File) => {
      if (!DOC_EXT.test(file.name)) {
        onError("Please upload a PDF, Word (.docx), or text file.");
        return;
      }
      setUploading(true);
      onError(null);
      try {
        const presignRes = await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "presign",
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            docType: "chat-upload",
          }),
        });
        if (!presignRes.ok) throw new Error("Could not start the upload.");
        const { docId, uploadUrl } = await presignRes.json();

        const put = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!put.ok) throw new Error("Upload failed.");

        const commit = await fetch("/api/vault", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            step: "commit",
            docId,
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            sizeBytes: file.size,
            docType: "chat-upload",
          }),
        });
        if (!commit.ok) throw new Error("Could not save the document.");

        onAttachDoc({ docId, fileName: file.name });
      } catch (e) {
        onError(e instanceof Error ? e.message : "Upload failed.");
      } finally {
        setUploading(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    },
    [onAttachDoc, onError],
  );

  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
      <div className="container" style={{ maxWidth: 820, padding: "14px 20px" }}>
        {attachedDoc && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              background: "var(--bg)",
              border: "1px solid var(--border)",
              borderRadius: 999,
              padding: "5px 12px",
              fontSize: 13,
              marginBottom: 10,
            }}
          >
            <span>📎 {attachedDoc.fileName}</span>
            <button
              onClick={() => onAttachDoc(null)}
              aria-label="Remove attachment"
              style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--muted)", fontSize: 15, lineHeight: 1 }}
            >
              ✕
            </button>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/msword,text/plain,text/markdown"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
            style={{ display: "none" }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={disabled || uploading}
            title="Upload a document to review"
            className="btn btn-ghost"
            style={{ height: 48, width: 48, padding: 0, flexShrink: 0, fontSize: 20 }}
          >
            {uploading ? "…" : "+"}
          </button>
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                onSend();
              }
            }}
            placeholder="Ask about programmes, scholarships, costs, visas, documents, IELTS…"
            rows={1}
            style={{
              flex: 1,
              resize: "none",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: "13px 14px",
              fontSize: 15.5,
              fontFamily: "inherit",
              lineHeight: 1.4,
              minHeight: 48,
              maxHeight: 160,
              outline: "none",
              boxSizing: "border-box",
            }}
          />
          <button
            className="btn btn-primary"
            onClick={onSend}
            disabled={disabled}
            style={{ height: 48, padding: "0 22px", flexShrink: 0, opacity: disabled ? 0.6 : 1 }}
          >
            Send
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: "8px 2px 0" }}>
          Shetu shares reliable facts with their sources. Always check the official university and
          visa pages too. This is help and guidance, not legal advice.
        </p>
      </div>
    </div>
  );
}
