"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import type { ChatStreamEvent } from "@/lib/agent/stream-protocol";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  { title: "Assess my readiness", prompt: "I want to study abroad for a master's. Can you assess how ready I am and what gaps I need to close? I'll share my background." },
  { title: "What are the real costs?", prompt: "What does it really cost to study abroad for one year, including tuition, living costs, insurance and visa proof of funds? Please be honest and itemised." },
  { title: "Find scholarships for me", prompt: "What scholarships could I realistically apply for, and which ones actually cover full tuition versus only part?" },
  { title: "Is this agency offer legit?", prompt: "An agency told me they can guarantee my admission and visa, and secure me a scholarship if I pay an upfront package fee. Is this legitimate?" },
  { title: "Review my statement", prompt: "I'd like help improving my statement of purpose. What makes a strong one, and how should I start?" },
  { title: "Help me prepare for IELTS", prompt: "I need to prepare for IELTS. Can you explain the bands and give me a short writing practice task at my level?" },
];

export function Chat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, activeTool]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || streaming) return;
      setError(null);

      const history = messages.map((m) => ({ role: m.role, content: m.content }));
      const next: Msg[] = [...messages, { role: "user", content: trimmed }, { role: "assistant", content: "" }];
      setMessages(next);
      setInput("");
      setStreaming(true);
      setActiveTool(null);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history }),
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
    [messages, streaming],
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

      <Composer value={input} onChange={setInput} onSend={() => send(input)} disabled={streaming} />
    </div>
  );
}

function EmptyState({ onPick }: { onPick: (prompt: string) => void }) {
  return (
    <div>
      <h1 style={{ fontSize: 28, margin: "6px 0 6px" }}>How can I help with your plans?</h1>
      <p className="muted" style={{ margin: "0 0 24px", fontSize: 16 }}>
        Ask me anything about studying abroad. Pick a starting point, or just type your question.
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
}: {
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  disabled: boolean;
}) {
  return (
    <div style={{ borderTop: "1px solid var(--border)", background: "var(--surface)" }}>
      <div className="container" style={{ maxWidth: 820, padding: "14px 20px" }}>
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
              padding: "12px 14px",
              fontSize: 15.5,
              fontFamily: "inherit",
              lineHeight: 1.5,
              maxHeight: 160,
              outline: "none",
            }}
          />
          <button className="btn btn-primary" onClick={onSend} disabled={disabled} style={{ opacity: disabled ? 0.6 : 1 }}>
            Send
          </button>
        </div>
        <p className="muted" style={{ fontSize: 12, margin: "8px 2px 0" }}>
          Shetu gives source-cited guidance, but always verify with the official university and
          immigration pages. It is not a substitute for legal or immigration advice.
        </p>
      </div>
    </div>
  );
}
