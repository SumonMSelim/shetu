import { auth } from "@/auth";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { listMentorshipRequests, putMentorshipRequest } from "@/lib/aws/repository";

/**
 * Mentorship API.
 *
 *  GET  -> list the current user's mentorship requests and their status
 *  POST -> create a new mentorship request (also creatable by the agent tool)
 */
export const runtime = "nodejs";

const CreateSchema = z.object({
  topic: z.string().min(1).max(120),
  message: z.string().min(1).max(4000),
});

async function userIdOrNull(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(): Promise<Response> {
  const userId = await userIdOrNull();
  if (!userId) return new Response("Unauthorized", { status: 401 });
  const requests = await listMentorshipRequests(userId);
  return Response.json({ requests });
}

export async function POST(req: Request): Promise<Response> {
  const userId = await userIdOrNull();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let c: z.infer<typeof CreateSchema>;
  try {
    c = CreateSchema.parse(await req.json());
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const requestId = randomUUID();
  await putMentorshipRequest({
    userId,
    requestId,
    topic: c.topic,
    message: c.message,
    status: "open",
    createdAt: new Date().toISOString(),
  });
  return Response.json({ ok: true, requestId });
}
