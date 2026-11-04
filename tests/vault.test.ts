import { test } from "node:test";
import assert from "node:assert/strict";

process.env.AWS_ACCESS_KEY_ID ??= "test";
process.env.AWS_SECRET_ACCESS_KEY ??= "test";

test("upload URL only requires headers the browser sends (content-type)", async () => {
  const { presignUpload } = await import("../src/lib/aws/vault");
  const url = new URL(await presignUpload("user/doc/file.txt", "text/plain"));
  const signed = (url.searchParams.get("X-Amz-SignedHeaders") ?? "").split(";");

  assert.ok(!signed.some((h) => h.startsWith("x-amz-server-side-encryption")), `signed headers: ${signed}`);
  assert.ok(!url.searchParams.has("x-amz-server-side-encryption"));
  assert.deepEqual(signed.filter((h) => h !== "host" && h !== "content-type"), []);
});
