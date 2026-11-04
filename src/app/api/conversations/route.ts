import { auth } from "@/auth";
import { listConversations, listMessages } from "@/lib/aws/repository";

/**
 * Conversations API.
 *
 *  GET                 -> list the current user's conversations (newest first)
 *  GET ?convId=<id>    -> list the messages in one conversation
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
