import { auth } from "@/auth";
import { randomUUID } from "node:crypto";
import { buildOrchestrator } from "@/lib/agent/orchestrator";
import { encodeEvent, streamErrorMessage, toolLabel, type ChatStreamEvent } from "@/lib/agent/stream-protocol";
import type { MessageData, ContentBlockData, DocumentFormat } from "@strands-agents/sdk";
import {
  getVaultDoc,
  listMessages,
  appendMessage,
  putConversation,
  touchConversation,
  putTurnTrace,
  type ChatMessageRecord,
} from "@/lib/aws/repository";
import { consumeBurst, consumeChatQuota } from "@/lib/aws/rate-limit";
import { TurnTraceCollector } from "@/lib/observability/trace";
import { emitMetrics, logError, logInfo, logWarn } from "@/lib/observability/logger";
import { config } from "@/lib/config";
import { z } from "zod";

/**
 * Chat endpoint.
 *
 * Authenticates the user, counts the message against their daily quota, loads
 * the conversation history from storage, rebuilds the multi-agent orchestrator
 * for them, streams the run back as newline-delimited JSON (text chunks plus
 * tool-activity markers), and persists both the user message and the assistant
 * reply so history survives reloads. Every turn also writes an append-only
 * TRACE# audit record (model calls, token usage, tool calls) and emits
 * CloudWatch metrics, so cost and behaviour are observable per turn. Runs on
 * the Node runtime because the Strands SDK and AWS SDK need it.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  message: z.string().min(1).max(8000),
  /** Existing conversation to continue; omit to start a new one. */
  convId: z.string().uuid().optional(),
  /** Optional: attach a Vault document (by id) for the agent to review directly. */
  docId: z.string().uuid().optional(),
});

/** Map common document formats to the Bedrock DocumentFormat enum. */
const DOC_FORMATS: Record<string, DocumentFormat> = {
  pdf: "pdf",
  csv: "csv",
  doc: "doc",
  docx: "docx",
  xls: "xls",
  xlsx: "xlsx",
  html: "html",
  txt: "txt",
  md: "md",
  json: "json",
  xml: "xml",
};

function formatFromName(fileName: string): DocumentFormat | null {
  const ext = fileName.split(".").pop()?.toLowerCase() ?? "";
  return DOC_FORMATS[ext] ?? null;
}

/** Hard caps for the agent loop, shared by every specialist delegation. */
const AGENT_LIMITS = {
  turns: config.limits.agentTurns,
  outputTokens: config.limits.agentOutputTokens,
  totalTokens: config.limits.agentTotalTokens,
};

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) {
    return new Response("Unauthorized", { status: 401 });
  }

  let parsed: z.infer<typeof BodySchema>;
  try {
    parsed = BodySchema.parse(await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  // Cost and abuse guardrails: per-minute burst first, then the daily quota.
  if (!(await consumeBurst(userId, "chat", config.limits.burst.chat))) {
    return new Response("Too many requests: please wait a moment.", { status: 429 });
  }
  const quota = await consumeChatQuota(userId);
  if (!quota.allowed) {
    logInfo("chat.quota_exceeded", { userId, used: quota.used, limit: quota.limit });
    return new Response(
      JSON.stringify({
        error: `You have used all ${quota.limit} messages for today. Please come back tomorrow. If you need help sooner, you can request a human mentor from the Mentorship page.`,
      }),
      { status: 429, headers: { "Content-Type": "application/json; charset=utf-8" } },
    );
  }

  // Resolve the conversation: continue an existing one or start a new one.
  const convId = parsed.convId ?? randomUUID();
  const isNew = !parsed.convId;
  const now = new Date().toISOString();
  logInfo("chat.request", { userId, convId, isNew, messageChars: parsed.message.length });

  // Load prior turns from storage (authoritative), not from the client.
  const prior = isNew ? [] : await listMessages(userId, convId);
  const history: MessageData[] = prior.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));
  const nextSeq = prior.length;

  // Persist the conversation shell (on first message) and the user's message.
  if (isNew) {
    const title = parsed.message.trim().slice(0, 60) || "New conversation";
    await putConversation({ userId, convId, title, createdAt: now, updatedAt: now });
  }
  const userMsg: ChatMessageRecord = {
    userId,
    convId,
    seq: nextSeq,
    role: "user",
    content: parsed.message,
    createdAt: now,
  };
  await appendMessage(userMsg);

  const agent = buildOrchestrator(userId, history as never);

  // Build the turn input. If the student attached a Vault document, pass it to
  // the model as a native document block (by S3 reference) so Claude can read
  // PDFs, Word docs, etc. directly - no server-side parsing needed.
  let turnInput: string | ContentBlockData[] = parsed.message;
  if (parsed.docId) {
    const doc = await getVaultDoc(userId, parsed.docId);
    const format = doc ? formatFromName(doc.fileName) : null;
    if (doc && format) {
      turnInput = [
        {
          document: {
            name: doc.fileName.replace(/[^a-zA-Z0-9 _.-]/g, "_"),
            format,
            source: {
              location: {
                type: "s3",
                uri: `s3://${config.storage.vaultBucket}/${doc.s3Key}`,
              },
            },
            citations: { enabled: true },
          },
        },
        { text: parsed.message },
      ];
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (e: ChatStreamEvent) => controller.enqueue(encoder.encode(encodeEvent(e)));
      // Tell the client which conversation this is (so a new one is remembered).
      send({ kind: "meta", convId });
      // Keepalive: Cloudflare terminates origins that stay silent for ~100s,
      // and a specialist can be silent longer than that. Ping every 15s; the
      // client ignores unknown event kinds.
      const ping = setInterval(() => {
        try {
          send({ kind: "ping" });
        } catch {
          // Stream already closed; the finally block clears this timer.
        }
      }, 15000);
      // Avoid duplicate "tool" markers for the same tool within a burst.
      let lastTool = "";
      let answer = "";
      const trace = new TurnTraceCollector();
      // The orchestrator often speaks, calls tools, then speaks again. The
      // client appends every text delta into one message, so without a
      // separator the segments glue together mid-sentence. Insert one blank
      // line before the first text that follows a tool call.
      let afterToolCall = false;
      let sentText = false;
      try {
        for await (const event of agent.stream(turnInput, { limits: AGENT_LIMITS })) {
          switch (event.type) {
            case "modelStreamUpdateEvent": {
              const inner = event.event;
              trace.onModelStreamEvent(inner);
              if (
                inner.type === "modelContentBlockDeltaEvent" &&
                inner.delta.type === "textDelta" &&
                inner.delta.text
              ) {
                if (afterToolCall && sentText) {
                  const sep = "\n\n";
                  answer += sep;
                  send({ kind: "text", text: sep });
                }
                afterToolCall = false;
                sentText = true;
                answer += inner.delta.text;
                send({ kind: "text", text: inner.delta.text });
              }
              break;
            }
            case "beforeToolCallEvent": {
              trace.onBeforeToolCall(event.toolUse);
              afterToolCall = true;
              const name = event.toolUse.name;
              if (name && name !== lastTool) {
                lastTool = name;
                send({ kind: "tool", name, label: toolLabel(name) });
              }
              break;
            }
            case "afterToolCallEvent": {
              trace.onAfterToolCall(event.toolUse, event.error);
              break;
            }
            case "agentResultEvent": {
              trace.onAgentResult(event.result as { stopReason?: string });
              break;
            }
            default:
              break;
          }
        }
        // Persist the assistant reply and bump the conversation timestamp.
        if (answer.trim()) {
          await appendMessage({
            userId,
            convId,
            seq: nextSeq + 1,
            role: "assistant",
            content: answer,
            createdAt: new Date().toISOString(),
          });
          await touchConversation(userId, convId, new Date().toISOString());
        }

        // Audit record + metrics for this turn. Observability must never break
        // the chat response; the user already has their answer at this point.
        const turnTrace = trace.finish(userId, convId, nextSeq);
        try {
          await putTurnTrace(turnTrace);
        } catch (err) {
          logWarn("chat.trace_write_failed", err, { userId, convId, turn: nextSeq });
        }
        emitMetrics({
          InputTokens: [turnTrace.totals.inputTokens, "Count"],
          OutputTokens: [turnTrace.totals.outputTokens, "Count"],
          TotalTokens: [turnTrace.totals.totalTokens, "Count"],
          DurationMs: [turnTrace.durationMs, "Milliseconds"],
          ToolCalls: [turnTrace.toolCalls.length, "Count"],
        });
        logInfo("chat.turn", {
          userId,
          convId,
          turn: nextSeq,
          modelCalls: turnTrace.modelCalls.length,
          toolCalls: turnTrace.toolCalls.length,
          specialists: turnTrace.specialists,
          tokens: turnTrace.totals.totalTokens,
          durationMs: turnTrace.durationMs,
          stopReason: turnTrace.stopReason,
        });

        send({ kind: "done" });
      } catch (err) {
        logError("chat.stream_error", err, { userId, convId, turn: nextSeq });
        // The student may already have received most of the answer when the
        // turn failed (e.g. the model hit its output limit mid-listing).
        // Persist whatever streamed, so a refresh keeps it, and say honestly
        // what happened instead of a generic error.
        if (answer.trim()) {
          try {
            await appendMessage({
              userId,
              convId,
              seq: nextSeq + 1,
              role: "assistant",
              content: answer,
              createdAt: new Date().toISOString(),
            });
            await touchConversation(userId, convId, new Date().toISOString());
          } catch (persistErr) {
            logError("chat.persist_failed", persistErr, { userId, convId, turn: nextSeq });
          }
        }
        // Record the failed turn too: audit both what worked and what did not.
        try {
          await putTurnTrace(trace.finish(userId, convId, nextSeq, err));
        } catch {
          // Audit write is best-effort.
        }
        send({ kind: "error", message: streamErrorMessage(err) });
      } finally {
        clearInterval(ping);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
