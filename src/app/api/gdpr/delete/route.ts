import { auth } from "@/auth";
import { z } from "zod";
import { deleteEverythingForUser } from "@/lib/aws/repository";
import { deleteVaultUserObjects } from "@/lib/aws/vault";
import { consumeBurst } from "@/lib/aws/rate-limit";
import { config } from "@/lib/config";
import { logError, logInfo } from "@/lib/observability/logger";

/**
 * GDPR erasure (Art. 17), self-service.
 *   POST -> deletes everything stored about the signed-in user: the whole
 *   DynamoDB partition (profile, conversations, messages, mentorship requests,
 *   Vault metadata, traces, counters) and every Vault file in S3. A minimal
 *   tombstone (id + date, no content) remains so old identifiers cannot be
 *   silently reused. The client signs out afterwards.
 *
 * Burst-limited: an accidental double click cannot multiply the work.
 */
export const runtime = "nodejs";

const BodySchema = z.object({ confirm: z.literal(true) });

export async function POST(req: Request): Promise<Response> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch {
    return new Response("Bad request: confirm must be true", { status: 400 });
  }

  if (!(await consumeBurst(userId, "gdpr", config.limits.burst.gdpr))) {
    return new Response("Too many requests", { status: 429 });
  }

  try {
    const vaultDeleted = await deleteVaultUserObjects(userId);
    const itemsDeleted = await deleteEverythingForUser(userId);
    logInfo("gdpr.erasure", { userId, vaultDeleted, itemsDeleted });
    return Response.json({ ok: true, itemsDeleted, vaultDeleted });
  } catch (err) {
    logError("gdpr.erasure_failed", err, { userId });
    return new Response("Deletion failed partway: please try again or contact support.", {
      status: 500,
    });
  }
}
