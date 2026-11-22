import { test } from "node:test";
import assert from "node:assert/strict";
import { mapProgram } from "../src/lib/knowledge/sources/studyinnl-finder";
import { mergeProgrammes } from "../src/lib/knowledge/draft";
import type { Programme } from "../src/lib/knowledge/types";

/**
 * Studyfinder API adapter tests: mapping a fixture record onto the Programme
 * schema (fees per latest year, non-EU deadline first, sector mapping,
 * duration parsing), skipping non-degree records, and merge update semantics.
 */

const RAW = {
  id: 476,
  slug: "arts-culture-476-university-of-groningen",
  name: "Arts & Culture",
  type: "Master",
  field_of_study: "Humanities, social sciences, communication and arts",
  institution: {
    name: "University of Groningen",
    sector: "Research university",
    city: "Groningen",
  },
  locations: [{ name: "Groningen" }],
  languages: [{ name: "English" }],
  duration: "1 year",
  ects_credits: 60,
  qualification: "Master of Arts",
  website: "https://www.rug.nl/masters/arts-and-culture/",
  admission_url: ["https://www.rug.nl/masters/arts-and-culture/apply"],
  tuitions: [
    { year: 2026, amount: 2694, tuition_fee_type: "statutory", program_form: "fulltime" },
    { year: 2027, amount: 2771, tuition_fee_type: "statutory", program_form: "fulltime" },
    { year: 2026, amount: 19900, tuition_fee_type: "international", program_form: "fulltime" },
    { year: 2027, amount: 20500, tuition_fee_type: "international", program_form: "fulltime" },
  ],
  start_months: [
    { start_date: "2027-09-01", application_deadline: "2027-05-01", application_deadline_non_eu: "2027-04-01" },
  ],
  language_requirements: [
    [{ minimum_score: "6.5", description: "IELTS overall band" }],
  ],
  accreditations: [{ name: "NVAO" }],
};

test("mapProgram maps the API record onto the Programme schema", () => {
  const p = mapProgram(RAW as never, "NL", "2026-11-22");
  assert.ok(p, "record should map");
  assert.equal(p!.id, "nl-arts-culture-476-university-of-groningen");
  assert.equal(p!.institution, "University of Groningen");
  assert.equal(p!.institutionType, "research-university");
  assert.equal(p!.level, "master");
  // Fees come from the latest tuition year (2027).
  assert.equal(p!.tuitionEu, 2771);
  assert.equal(p!.tuitionNonEu, 20500);
  assert.equal(p!.provenance.period, "2027");
  // The non-EU deadline is the binding one and is stated first.
  assert.match(p!.applicationDeadline ?? "", /2027-04-01 \(non-EU\)/);
  assert.match(p!.englishRequirement ?? "", /IELTS 6.5 overall/);
  assert.equal(p!.durationMonths, 12);
  assert.equal(p!.language, "English");
  assert.equal(p!.city, "Groningen");
  // The university's own page is the application link, not the finder page.
  assert.equal(p!.applicationUrl, "https://www.rug.nl/masters/arts-and-culture/");
  assert.match(p!.provenance.sourceUrl, /studyinnl\.org\/dutch-education\/studies\//);
});

test("mapProgram skips non-degree records", () => {
  const p = mapProgram({ ...RAW, type: "Short or summer course" } as never, "NL", "2026-11-22");
  assert.equal(p, null, "short courses are out of the serving schema");
});

test("mergeProgrammes updates an existing record when fields change", () => {
  const existing = {
    ...mapProgram(RAW as never, "NL", "2026-01-01")!,
    tuitionEu: 2600, // stale fee from last year
  } as Programme;
  const fresh = mapProgram(RAW as never, "NL", "2026-11-22")!;
  const { added, updated, unchanged } = mergeProgrammes([existing], [fresh]);
  assert.equal(added.length, 0);
  assert.equal(updated.length, 1);
  assert.ok(updated[0].changes.includes("tuitionEu"));
  assert.equal(existing.tuitionEu, 2771);
  assert.equal(existing.provenance.retrieved, "2026-11-22");
  assert.equal(unchanged, 0);
});

test("mergeProgrammes treats identical records as unchanged", () => {
  const existing = mapProgram(RAW as never, "NL", "2026-11-22")!;
  const fresh = mapProgram(RAW as never, "NL", "2026-11-22")!;
  const { added, updated, unchanged } = mergeProgrammes([existing], [fresh]);
  assert.equal(added.length, 0);
  assert.equal(updated.length, 0);
  assert.equal(unchanged, 1);
});
