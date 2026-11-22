import { test } from "node:test";
import assert from "node:assert/strict";
import { daadInstitutionType, mapDaad } from "../src/lib/knowledge/sources/daad-finder";

/**
 * DAAD adapter tests: courseType -> level mapping, semester duration parsing,
 * tuition strings kept as honest notes (no numeric guessing), institution-type
 * heuristic, and CEFR English requirements.
 */

const RAW = {
  id: 4722,
  courseName: "Actuarial and Financial Mathematics",
  academy: "RPTU University Kaiserslautern-Landau",
  city: "Kaiserslautern",
  languages: ["English"],
  languageLevelEnglish: null,
  programmeDuration: "4 semesters",
  tuitionFees: "No tuition fees",
  applicationDeadline: "Register by 31 October 2026 + 1 more",
  financialSupport: null,
  subject: "Applied Mathematics",
  courseType: 2,
  link: "/deutschland/studienangebote/international-programmes/en/detail/4722/",
};

test("mapDaad maps a DAAD record onto the Programme schema", () => {
  const p = mapDaad(RAW as never, "2026-11-22");
  assert.ok(p, "record should map");
  assert.equal(p!.id, "de-daad-4722");
  assert.equal(p!.level, "master");
  assert.equal(p!.institution, "RPTU University Kaiserslautern-Landau");
  assert.equal(p!.institutionType, "research-university");
  assert.equal(p!.durationMonths, 24, "4 semesters = 24 months");
  assert.equal(p!.city, "Kaiserslautern");
  assert.equal(p!.language, "English");
  assert.equal(p!.applicationDeadline, "Register by 31 October 2026 + 1 more");
  assert.match(p!.applicationUrl, /daad\.de.*detail\/4722/);
  assert.match(p!.notes ?? "", /No tuition fees/);
  assert.match(p!.provenance.sourceUrl, /daad\.de.*detail\/4722/);
});

test("mapDaad keeps tuition strings as notes and invents no numbers", () => {
  const p = mapDaad({ ...RAW, tuitionFees: "EUR 1,500 per semester" } as never, "2026-11-22");
  assert.equal(p!.tuitionEu, undefined, "per-semester prose is not annualised into a figure");
  assert.match(p!.notes ?? "", /EUR 1,500 per semester/);
});

test("mapDaad skips records without a level or name", () => {
  assert.equal(mapDaad({ ...RAW, courseType: 56 } as never, "2026-11-22"), null, "summer courses skipped");
  assert.equal(mapDaad({ ...RAW, courseName: "" } as never, "2026-11-22"), null);
});

test("institution type heuristic: applied sciences beats university keyword", () => {
  assert.equal(daadInstitutionType("Hochschule Darmstadt - University of Applied Sciences"), "university-of-applied-sciences");
  assert.equal(daadInstitutionType(" Ludwig-Maximilians-Universität München"), "research-university");
  assert.equal(daadInstitutionType("Berlin International University of Applied Sciences"), "university-of-applied-sciences");
  assert.equal(daadInstitutionType("Bremen University of Applied Sciences"), "university-of-applied-sciences");
});
