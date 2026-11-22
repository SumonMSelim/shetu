import { auth } from "@/auth";
import { dbConfigured, dbPool } from "@/lib/db/postgres";
import { groupExportItems } from "@/lib/gdpr/export";
import { listEverythingForUser } from "@/lib/aws/repository";
import { listVaultUserObjects } from "@/lib/aws/vault";
import { logInfo } from "@/lib/observability/logger";

/**
 * GDPR export (Art. 15/20).
 *   GET -> a downloadable JSON bundle of everything stored about the signed-in
 *   user: profile, conversations with messages, mentorship requests, Vault
 *   document metadata, usage counters, and audit traces. Vault binary files
 *   are excluded (downloadable from the Vault page itself).
 */
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  const session = await auth();
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const items = await listEverythingForUser(userId);
  const bundle = groupExportItems(userId, items, new Date().toISOString());

  // Vault files are binary: the export lists them so the student knows what
  // exists, and downloads the files themselves from the Vault page.
  bundle.other.push({
    vaultFiles: await listVaultUserObjects(userId),
  });

  logInfo("gdpr.export", { userId, items: items.length });

  const filename = `shetu-data-${new Date().toISOString().slice(0, 10)}.json`;
  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
