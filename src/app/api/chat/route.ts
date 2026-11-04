import { auth } from "@/auth";
import { buildOrchestrator } from "@/lib/agent/orchestrator";
import { encodeEvent, toolLabel, type ChatStreamEvent } from "@/lib/agent/stream-protocol";
import type { MessageData, ContentBlockData, DocumentFormat } from "@strands-agents/sdk";
import { getVaultDoc } from "@/lib/aws/repository";
import { config } from "@/lib/config";
import { z } from "zod";

/**
 * Chat endpoint.
 *
 * Authenticates the user, rebuilds the multi-agent orchestrator for them
 * (prior turns replayed as history), and streams the run back as
 * newline-delimited JSON: text chunks plus tool-activity markers so the UI can
 * show which specialist is working. Runs on the Node runtime because the
 * Strands SDK and AWS SDK need it.
 */
export const runtime = "nodejs";
export const maxDuration = 120;

const BodySchema = z.object({
  message: z.string().min(1).max(8000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      }),
    )
    .max(50)
    .optional(),
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

  // Replay prior conversation as agent history.
  const history: MessageData[] | undefined = parsed.history?.map((m) => ({
    role: m.role,
    content: [{ text: m.content }],
  }));

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
      // Avoid duplicate "tool" markers for the same tool within a burst.
      let lastTool = "";
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
