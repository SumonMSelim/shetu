import { test } from "node:test";
import assert from "node:assert/strict";
import { groupExportItems } from "../src/lib/gdpr/export";
import { burstAllowed, burstKey } from "../src/lib/aws/rate-limit";

/**
 * GDPR self-service tests: the export grouping (Art. 15/20 bundle) and the
 * burst limiter decision helpers behind the rate limiting.
 */

test("groupExportItems classifies records and strips internal keys", () => {
  const items = [
    { PK: "USER#u1", SK: "PROFILE", name: "Muhammad" },
    { PK: "USER#u1", SK: "CONV#abc", title: "Test chat" },
    { PK: "USER#u1", SK: "CONVMSG#abc#000001", content: "hello" },
    { PK: "USER#u1", SK: "CONVMSG#abc#000002", content: "hi there" },
    { PK: "USER#u1", SK: "MENTORSHIP#r1", topic: "Choosing between two offers" },
    { PK: "USER#u1", SK: "DOC#d1", fileName: "sop.pdf" },
    { PK: "USER#u1", SK: "TRACE#abc#000000", tokens: 500 },
    { PK: "USER#u1", SK: "RATE#BURST#chat#2026-11-22T14:03", count: 3 },
    { PK: "USER#u1", SK: "SOMETHINGELSE", x: 1 },
  ];
  const bundle = groupExportItems("u1", items, "2026-11-22T00:00:00Z");
  assert.equal(bundle.profile?.name, "Muhammad");
  assert.equal(bundle.conversations.length, 1);
  assert.equal(bundle.conversations[0].conversationId, "abc");
  assert.deepEqual(
    bundle.conversations[0].messages.map((m) => m.content),
    ["hello", "hi there"],
  );
  assert.equal(bundle.mentorshipRequests[0].topic, "Choosing between two offers");
  assert.equal(bundle.vaultDocuments[0].fileName, "sop.pdf");
  assert.equal(bundle.traces.length, 1);
  assert.equal(bundle.usageCounters.length, 1);
  assert.equal(bundle.other.length, 1);
  // Internal keys stripped everywhere.
  for (const group of [
    bundle.mentorshipRequests,
    bundle.vaultDocuments,
    bundle.traces,
    bundle.usageCounters,
    bundle.other,
  ]) {
    for (const item of group) assert.equal("PK" in item, false);
  }
});

test("groupExportItems excludes tombstones from the export", () => {
  const bundle = groupExportItems("u1", [{ PK: "USER#u1", SK: "DELETED", deletedAt: "x" }], "now");
  assert.equal(bundle.profile, undefined);
  assert.equal(bundle.conversations.length, 0);
});

test("burstKey namespaces by route and window", () => {
  assert.equal(burstKey("chat", "2026-11-22T14:03"), "RATE#BURST#chat#2026-11-22T14:03");
});

test("burstAllowed is inclusive up to the limit", () => {
  assert.equal(burstAllowed(15, 15), true);
  assert.equal(burstAllowed(16, 15), false);
  assert.equal(burstAllowed(1, 1), true);
  assert.equal(burstAllowed(2, 1), false);
});
