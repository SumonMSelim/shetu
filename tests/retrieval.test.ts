import { test } from "node:test";
import assert from "node:assert/strict";
import { fuseResults, rowToProgramme } from "../src/lib/knowledge/retrieval";

/**
 * Hybrid retrieval logic tests: reciprocal rank fusion and database row
 * mapping. The SQL and embedding calls are integration (live) paths.
 */

test("fuseResults merges two ranked lists by reciprocal rank", () => {
  const a = [{ id: "A" }, { id: "B" }, { id: "C" }];
  const b = [{ id: "B" }, { id: "D" }, { id: "A" }];
  // Scores: B (rank 1 + rank 0) beats A (rank 0 + rank 2); C and D tie lower.
  const fused = fuseResults(a, b);
  assert.deepEqual(fused.map((r) => r.id), ["B", "A", "D", "C"]);
});

test("fuseResults works when one candidate list is empty", () => {
  assert.deepEqual(fuseResults([{ id: "X" }], []).map((r) => r.id), ["X"]);
  assert.deepEqual(fuseResults([], [{ id: "Y" }]).map((r) => r.id), ["Y"]);
  assert.deepEqual(fuseResults<{ id: string }>([], []).map((r) => r.id), []);
});

test("rowToProgramme maps a database row onto the Programme shape", () => {
  const row = {
    id: "nl-arts-culture-476-university-of-groningen",
    name: "Arts & Culture",
    institution: "University of Groningen",
    institution_type: "research-university",
    level: "master",
    field: "Humanities",
    language: "English",
    city: "Groningen",
    duration_months: 12,
    tuition_eu: "2694",
    tuition_non_eu: null,
    application_deadline: "2027-05-01 (non-EU)",
    english_requirement: null,
    application_url: "https://www.rug.nl/masters/arts-and-culture/",
    notes: "60 EC; accredited by NVAO",
    provenance: JSON.stringify({
      source: "Study in NL Studyfinder",
      sourceUrl: "https://www.studyinnl.org/dutch-education/studies/x",
      retrieved: "2026-11-22",
      period: "2027",
    }),
    verified_on: "2026-11-22",
    stale: false,
  };
  const p = rowToProgramme(row);
  assert.equal(p.tuitionEu, 2694, "numeric columns are coerced to numbers");
  assert.equal("tuitionNonEu" in p, false, "absent fees stay absent");
  assert.equal(p.provenance.retrieved, "2026-11-22", "provenance jsonb is parsed");
  assert.equal(p.verifiedOn, "2026-11-22");
  assert.equal(p.stale, false);
  assert.equal(p.durationMonths, 12);
  assert.equal(p.institutionType, "research-university");
});

test("rowToProgramme handles a string stale flag and jsonb object", () => {
  const row = {
    id: "nl-old",
    name: "Old programme",
    institution: "X",
    institution_type: "institute",
    level: "master",
    field: "Y",
    language: "English",
    city: "Z",
    duration_months: null,
    tuition_eu: null,
    tuition_non_eu: null,
    application_deadline: null,
    english_requirement: null,
    application_url: "https://example.com",
    notes: null,
    provenance: { retrieved: "2025-08-01", sourceUrl: "https://example.com", source: "s" },
    verified_on: "2025-08-01",
    stale: true,
  };
  const p = rowToProgramme(row);
  assert.equal(p.stale, true, "stale rows carry the flag into the tool output");
  assert.equal(p.provenance.retrieved, "2025-08-01");
});
