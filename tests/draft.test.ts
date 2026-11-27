import { test } from "node:test";
import assert from "node:assert/strict";
import {
  htmlToText,
  mergeProgrammes,
  parseDraftJson,
  stampAndValidate,
  todayIso,
} from "../src/lib/knowledge/draft";
import type { Programme } from "../src/lib/knowledge/types";

/**
 * Drafting pipeline logic tests (Track D stage 2).
 *
 * The pipeline's discipline lives in these functions: recover JSON from the
 * model, validate before accepting, stamp provenance honestly, and never add
 * a duplicate. The Bedrock call itself is an integration step (manual run).
 */

const base = {
  institution: "University of Amsterdam",
  institutionType: "research-university",
  name: "MSc Computer Science",
  level: "master",
  field: "Computer Science",
  language: "English",
  city: "Amsterdam",
  currency: "EUR",
  applicationUrl: "https://www.uva.nl/en/masters/example",
};

function program(url: string, id = "test-programme"): Programme {
  return {
    ...base,
    id,
    applicationUrl: url,
    provenance: {
      source: "test",
      sourceUrl: url,
      retrieved: todayIso(),
    },
  } as Programme;
}

test("parseDraftJson recovers a fenced JSON array", () => {
  const reply = 'Here is what I found:\n```json\n[{"name": "MSc X"}]\n```\nHope this helps.';
  assert.deepEqual(parseDraftJson(reply), [{ name: "MSc X" }]);
});

test("parseDraftJson recovers a bare array surrounded by prose", () => {
  const reply = 'Sure! [{"name":"A"},{"name":"B"}] that is all.';
  assert.equal(parseDraftJson(reply).length, 2);
});

test("parseDraftJson throws when the reply has no array", () => {
  assert.throws(() => parseDraftJson("I could not find any programmes."), /no JSON array/);
});

test("stampAndValidate accepts a good draft, generates an id, stamps provenance", () => {
  const problems: string[] = [];
  const p = stampAndValidate(
    { ...base, level: "master" },
    { sourceUrl: base.applicationUrl, sourceName: "UvA page", retrieved: "2026-11-22", countryCode: "nl" },
    problems,
  );
  assert.ok(p, "draft should validate");
  assert.match(p!.id, /^nl-msc-computer-science/);
  assert.equal(p!.provenance.sourceUrl, base.applicationUrl);
  assert.equal(p!.provenance.retrieved, "2026-11-22");
  assert.equal(problems.length, 0);
});

test("stampAndValidate keeps a supplied id", () => {
  const problems: string[] = [];
  const p = stampAndValidate(
    { ...base, id: "nl-my-programme", level: "master" },
    { sourceUrl: base.applicationUrl, sourceName: "page", retrieved: "2026-11-22", countryCode: "nl" },
    problems,
  );
  assert.equal(p!.id, "nl-my-programme");
});

test("stampAndValidate fills applicationUrl and currency from the pipeline", () => {
  const problems: string[] = [];
  const { applicationUrl, currency, ...draftWithout } = { ...base, level: "master" } as Programme & { applicationUrl?: string; currency?: string };
  void applicationUrl;
  void currency;
  const p = stampAndValidate(
    draftWithout,
    { sourceUrl: "https://example.edu/programme", sourceName: "page", retrieved: "2026-11-22", countryCode: "nl", currency: "EUR" },
    problems,
  );
  assert.equal(p!.applicationUrl, "https://example.edu/programme", "programme page comes from the source URL");
  assert.equal(p!.currency, "EUR", "currency comes from the country meta");
});

test("stampAndValidate rejects drafts missing required fields", () => {
  const problems: string[] = [];
  const p = stampAndValidate(
    { institution: "X" },
    { sourceUrl: "https://example.com", sourceName: "page", retrieved: "2026-11-22", countryCode: "nl" },
    problems,
  );
  assert.equal(p, null);
  assert.ok(problems.length > 0, "problems must explain the rejection");
});

test("statutory fee enrichment is labelled, and skipped when the page stated its own facts", () => {
  const problems: string[] = [];
  const enriched = stampAndValidate(
    { ...base },
    { sourceUrl: base.applicationUrl, sourceName: "page", retrieved: "2026-11-22", countryCode: "nl", statutoryFeeEu: 2694 },
    problems,
  );
  assert.equal(enriched!.tuitionEu, 2694);
  assert.match(enriched!.notes ?? "", /national fee|Statutory/i);

  const ownFacts = stampAndValidate(
    { ...base, notes: "September intake only." },
    { sourceUrl: base.applicationUrl, sourceName: "page", retrieved: "2026-11-22", countryCode: "nl", statutoryFeeEu: 2694 },
    problems,
  );
  assert.equal(ownFacts!.tuitionEu, undefined, "no enrichment when the page stated its own facts");
});

test("mergeProgrammes keys identity on id, not on shared application URLs", () => {
  const existing = [program("https://a.example/one", "p1")];
  const drafts = [
    program("https://a.example/one", "p1"), // identical record -> unchanged
    program("https://a.example/one", "p2"), // DIFFERENT programme sharing one website URL -> must be added, not collapsed
    program("https://c.example/three", "p3"),
  ];
  const { added, unchanged } = mergeProgrammes(existing, drafts);
  assert.equal(added.length, 2, "both new programmes survive even with a shared URL");
  assert.equal(unchanged, 1);
  assert.deepEqual(
    added.map((p) => p.id).sort(),
    ["p2", "p3"],
  );
});

test("mergeProgrammes keeps a verified field the draft did not extract", () => {
  // Fees live on the per-programme detail API; a listing-only adapter draft
  // has no tuitionNonEu. The merge must preserve the enriched value, not
  // wipe it back to undefined.
  const enriched = { ...program("https://a.example/one", "p1"), tuitionNonEu: 30000 };
  const listingDraft = program("https://a.example/one", "p1");
  assert.equal(listingDraft.tuitionNonEu, undefined, "sanity: draft carries no fee");
  const { updated, unchanged } = mergeProgrammes([enriched], [listingDraft]);
  assert.equal(unchanged, 1, "no compared field changed from the draft side");
  assert.equal(updated.length, 0);
  assert.equal(enriched.tuitionNonEu, 30000, "enriched fee survives the harvest");
});

test("mergeProgrammes still updates a field when the draft states a new value", () => {
  const existing = [{ ...program("https://a.example/one", "p1"), tuitionNonEu: 30000 }];
  const changed = { ...program("https://a.example/one", "p1"), tuitionNonEu: 32000 };
  const { updated } = mergeProgrammes(existing, [changed]);
  assert.equal(updated.length, 1);
  assert.deepEqual(updated[0].changes, ["tuitionNonEu"]);
  assert.equal(existing[0].tuitionNonEu, 32000);
});

test("htmlToText strips scripts, tags and entities", () => {
  const html = "<html><head><script>bad()</script><style>x{}</style></head><body><h1>TU&nbsp;Delft</h1><p>Fees &amp; more</p></body></html>";
  const text = htmlToText(html);
  assert.ok(!text.includes("bad()"));
  assert.ok(!text.includes("<h1>"));
  assert.ok(text.includes("TU Delft"));
  assert.ok(text.includes("Fees & more"));
});
