import { auth } from "@/auth";
import { randomUUID } from "node:crypto";
import { buildOrchestrator } from "@/lib/agent/orchestrator";
import { encodeEvent, toolLabel, type ChatStreamEvent } from "@/lib/agent/stream-protocol";
import type { MessageData, ContentBlockData, DocumentFormat } from "@strands-agents/sdk";
import {
  getVaultDoc,
  listMessages,
  appendMessage,
  putConversation,
  touchConversation,
  type ChatMessageRecord,
} from "@/lib/aws/repository";
import { config } from "@/lib/config";
import { z } from "zod";

/**
 * Chat endpoint.
 *
 * Authenticates the user, loads the conversation history from storage, rebuilds
 * the multi-agent orchestrator for them, streams the run back as newline-
 * delimited JSON (text chunks plus tool-activity markers), and persists both
 * the user message and the assistant reply so history survives reloads. Runs on
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

  // Resolve the conversation: continue an existing one or start a new one.
  const convId = parsed.convId ?? randomUUID();
  const isNew = !parsed.convId;
  const now = new Date().toISOString();

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
      // Avoid duplicate "tool" markers for the same tool within a burst.
      let lastTool = "";
      let answer = "";
      try {
        for await (const event of agent.stream(turnInput)) {
          switch (event.type) {
            case "modelStreamUpdateEvent": {
              const inner = event.event;
              if (
                inner.type === "modelContentBlockDeltaEvent" &&
                inner.delta.type === "textDelta" &&
                inner.delta.text
              ) {
                answer += inner.delta.text;
                send({ kind: "text", text: inner.delta.text });
              }
              break;
            }
            case "beforeToolCallEvent": {
              const name = event.toolUse.name;
              if (name && name !== lastTool) {
                lastTool = name;
                send({ kind: "tool", name, label: toolLabel(name) });
              }
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
        send({ kind: "done" });
      } catch (err) {
        console.error("chat stream error", err);
        send({
          kind: "error",
          message:
            "Something went wrong while answering. Please try again. If it keeps happening, you can request a human mentor.",
        });
      } finally {
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
