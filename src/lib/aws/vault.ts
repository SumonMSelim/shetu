import {
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { s3 } from "./clients";
import { config } from "@/lib/config";

/**
 * Document Vault, backed by S3.
 *
 * Objects are namespaced per user (`<userId>/<docId>/<fileName>`) so one
 * student can never read another's files. The bucket blocks all public access;
 * the browser uploads and downloads via short-lived presigned URLs, and the
 * server reads text content for the Document Coach. Server-side encryption is
 * enforced by the bucket policy defined in infra.
 */

const BUCKET = config.storage.vaultBucket;

export function vaultKey(userId: string, docId: string, fileName: string): string {
  // Strip path separators from the filename to keep the key flat and safe.
  const safeName = fileName.replace(/[/\\]/g, "_");
  return `${userId}/${docId}/${safeName}`;
}

/** Presigned URL the browser uses to PUT a file directly into the Vault. */
export async function presignUpload(
  key: string,
  contentType: string,
  expiresInSeconds = 300,
): Promise<string> {
  return getSignedUrl(
    s3(),
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: "AES256",
    }),
    { expiresIn: expiresInSeconds },
  );
}

/** Presigned URL the browser uses to GET (download) a file from the Vault. */
export async function presignDownload(key: string, expiresInSeconds = 300): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: expiresInSeconds },
  );
}

/**
 * Read a document's content as text, for the Document Coach.
 *
 * Only intended for text-like documents (txt, md, and similar). Binary formats
 * such as PDF/DOCX would need extraction before this is useful; the caller
 * should check content type first.
 */
export async function readTextContent(key: string, maxBytes = 200_000): Promise<string> {
  const res = await s3().send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const body = res.Body;
  if (!body) return "";
  const text = await body.transformToString("utf-8");
  return text.length > maxBytes ? text.slice(0, maxBytes) : text;
}
