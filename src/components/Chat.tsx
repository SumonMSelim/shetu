"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { ChatStreamEvent } from "@/lib/agent/stream-protocol";

type Msg = { role: "user" | "assistant"; content: string };
type VaultDocRef = { docId: string; fileName: string };

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
  const [docs, setDocs] = useState<VaultDocRef[]>([]);
  const [attachedDocId, setAttachedDocId] = useState<string>("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeTool]);

  // Load the student's Vault documents so they can attach one to review.
  useEffect(() => {
    fetch("/api/vault")
      .then((r) => (r.ok ? r.json() : { documents: [] }))
      .then((d: { documents?: VaultDocRef[] }) =>
        setDocs((d.documents ?? []).map((x) => ({ docId: x.docId, fileName: x.fileName }))),
      )
      .catch(() => setDocs([]));
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);

      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const docId = attachedDocId || undefined;
      const attachedName = docId ? docs.find((d) => d.docId === docId)?.fileName : undefined;
      const shownContent = attachedName ? `📎 ${attachedName}\n\n${trimmed}` : trimmed;
      const next: Msg[] = [...messages, { role: "user", content: shownContent }, { role: "assistant", content: "" }];
      setMessages(next);
      setInput("");
      setAttachedDocId("");
      setStreaming(true);
      setActiveTool(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history, docId }),
        });
        if (!res.ok || !res.body) {
          throw new Error(res.status === 401 ? "Your session expired. Please sign in again." : "Request failed.");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

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
            if (event.kind === "text") {
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
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong.");
      } finally {
        setStreaming(false);
        setActiveTool(null);
        // Drop an empty assistant bubble if nothing came back.
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last && last.role === "assistant" && last.content === "") return prev.slice(0, -1);
          return prev;
        });
      }
    },
    [messages, streaming, attachedDocId, docs],
  );

  const empty = messages.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 60px)" }}>
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
        docs={docs}
        attachedDocId={attachedDocId}
        onAttach={setAttachedDocId}
      />
    </div>
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
          whiteSpace: "pre-wrap",
          lineHeight: 1.6,
          fontSize: 15.5,
          background: isUser ? "var(--primary)" : "var(--surface)",
          color: isUser ? "#fff" : "var(--text)",
          border: isUser ? "none" : "1px solid var(--border)",
          boxShadow: isUser ? "none" : "var(--shadow)",
          borderBottomRightRadius: isUser ? 4 : 16,
          borderBottomLeftRadius: isUser ? 16 : 4,
        }}
      >
        {content || "…"}
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

function Composer({
  value,
  onChange,
  onSend,
  disabled,
  docs,
  attachedDocId,
  onAttach,
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
  docs: VaultDocRef[];
  attachedDocId: string;
  onAttach: (docId: string) => void;
}) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
      <div className="container" style={{ maxWidth: 820, padding: "14px 20px" }}>
        {docs.length > 0 && (
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <label className="muted" style={{ fontSize: 13 }} htmlFor="attach">
              Attach a document to review:
            </label>
            <select
              id="attach"
              value={attachedDocId}
              onChange={(e) => onAttach(e.target.value)}
              style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13.5 }}
            >
              <option value="">None</option>
              {docs.map((d) => (
                <option key={d.docId} value={d.docId}>
                  {d.fileName}
                </option>
              ))}
            </select>
          </div>
        )}
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end" }}>
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
            style={{
              height: 48,
              padding: "0 22px",
              flexShrink: 0,
              opacity: disabled ? 0.6 : 1,
            }}
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
