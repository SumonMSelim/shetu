import { auth } from "@/auth";
import { consumeBurst } from "@/lib/aws/rate-limit";
import { deleteConversation, listConversations, listMessages } from "@/lib/aws/repository";
import { config } from "@/lib/config";

/**
 * Conversations API.
 *
 *  GET                     -> list the current user's conversations (newest first)
 *  GET ?convId=<id>        -> list the messages in one conversation
 *  DELETE ?convId=<id>     -> delete that conversation and its messages
 *                             (self-service; the partition-wide erasure lives
 *                             in /api/gdpr/delete)
 *
 * Creating conversations and appending messages happens inside the chat
 * streaming endpoint, so there is no POST here.
 */
export const runtime = "nodejs";

export async function GET(req: Request): Promise<Response> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const { searchParams } = new URL(req.url);
  const convId = searchParams.get("convId");

  if (convId) {
    const messages = await listMessages(userId, convId);
    return Response.json({
      convId,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  }

  const conversations = await listConversations(userId);
  return Response.json({
    conversations: conversations.map((c) => ({
      convId: c.convId,
      title: c.title,
      updatedAt: c.updatedAt,
    })),
  });
}

export async function DELETE(req: Request): Promise<Response> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  if (!(await consumeBurst(userId, "conversation-delete", config.limits.burst.conversationDelete))) {
    return Response.json(
      { error: "Too many deletions in one minute. Please try again shortly." },
      { status: 429 },
    );
  }

  const convId = new URL(req.url).searchParams.get("convId");
  if (!convId) return Response.json({ error: "convId is required" }, { status: 400 });

  const deleted = await deleteConversation(userId, convId);
  return Response.json({ convId, deleted });
}
