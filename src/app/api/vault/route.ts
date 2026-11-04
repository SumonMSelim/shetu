import { auth } from "@/auth";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { listVaultDocs, putVaultDoc } from "@/lib/aws/repository";
import { presignUpload, presignDownload, vaultKey } from "@/lib/aws/vault";

/**
 * Vault API.
 *
 *  GET                  -> list the current user's documents (with download URLs)
 *  POST  {step:"presign"} -> get a presigned S3 PUT URL to upload a file
 *  POST  {step:"commit"}  -> record document metadata after a successful upload
 *
 * The browser uploads bytes straight to S3 via the presigned URL, so file data
 * never passes through this server.
 */
export const runtime = "nodejs";

const PresignSchema = z.object({
  step: z.literal("presign"),
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  docType: z.string().max(40).optional(),
});

const CommitSchema = z.object({
  step: z.literal("commit"),
  docId: z.string().uuid(),
  fileName: z.string().min(1).max(200),
  contentType: z.string().min(1).max(100),
  sizeBytes: z.number().int().nonnegative(),
  docType: z.string().max(40).optional(),
});

async function userIdOrNull(): Promise<string | null> {
  const session = await auth();
  return (session?.user as { id?: string } | undefined)?.id ?? null;
}

export async function GET(): Promise<Response> {
  const userId = await userIdOrNull();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const docs = await listVaultDocs(userId);
  const withUrls = await Promise.all(
    docs.map(async (d) => ({
      docId: d.docId,
      fileName: d.fileName,
      contentType: d.contentType,
      sizeBytes: d.sizeBytes,
      docType: d.docType ?? null,
      uploadedAt: d.uploadedAt,
      downloadUrl: await presignDownload(d.s3Key),
    })),
  );
  return Response.json({ documents: withUrls });
}

export async function POST(req: Request): Promise<Response> {
  const userId = await userIdOrNull();
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return new Response("Bad request", { status: 400 });
  }

  if (body.step === "presign") {
    const p = PresignSchema.parse(body);
    const docId = randomUUID();
    const key = vaultKey(userId, docId, p.fileName);
    const uploadUrl = await presignUpload(key, p.contentType);
    return Response.json({ docId, uploadUrl });
  }

  if (body.step === "commit") {
    const c = CommitSchema.parse(body);
    const key = vaultKey(userId, c.docId, c.fileName);
    await putVaultDoc({
      userId,
      docId: c.docId,
      fileName: c.fileName,
      contentType: c.contentType,
      sizeBytes: c.sizeBytes,
      s3Key: key,
      docType: c.docType,
      uploadedAt: new Date().toISOString(),
    });
    return Response.json({ ok: true });
  }

  return new Response("Bad request", { status: 400 });
}
