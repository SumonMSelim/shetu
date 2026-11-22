import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { sourceRegistrySchema } from "../src/lib/knowledge/schema";
import { studyinnlTuitionAdapter } from "../src/lib/knowledge/sources/studyinnl-tuition";
import { applyFigureUpdates, isDue } from "../src/lib/knowledge/sources/schedule";

/**
 * Harvesting pipeline tests: deterministic extraction from a fixture page,
 * registry validity, scheduler due-logic, and figure-merge semantics.
 */

const FIXTURE = `<html><body>
<p>The statutory fee is € 2,694 for the academic year 2026-2027.</p>
<p>bachelor's programmes average between € 9,000 and € 20,000</p>
<p>master's programmes run between € 12,000 and € 30,000</p>
<p>institutions also charge non-EEA applicants a handling fee of roughly € 75–100.</p>
</body></html>`;

test("studyinnl-tuition adapter extracts the three fee figures deterministically", () => {
  const { figures, warnings } = studyinnlTuitionAdapter.extract(FIXTURE);
  assert.equal(warnings.length, 0);
  assert.deepEqual(figures, [
    { costId: "tuition-statutory", amount: 2694, period: "2026-2027" },
    { costId: "tuition-institutional", rangeLow: 9000, rangeHigh: 30000 },
    { costId: "application-handling-fee", rangeLow: 75, rangeHigh: 100 },
  ]);
});

test("adapter reports a warning instead of guessing when wording changes", () => {
  const { figures, warnings } = studyinnlTuitionAdapter.extract("<p>Tuition is cheap, trust me.</p>");
  assert.equal(figures.length, 0);
  assert.ok(warnings.some((w) => w.includes("not found")));
});

test("the committed source registry is valid", () => {
  const registry = sourceRegistrySchema.parse(JSON.parse(readFileSync("data/sources.json", "utf8")));
  assert.ok(registry.length >= 1);
  for (const s of registry) {
    assert.ok(s.intervalDays >= 1 && s.intervalDays <= 365);
    assert.match(s.url, /^https:\/\//);
  }
});

test("isDue: never run or interval elapsed means due", () => {
  const now = new Date("2026-11-22T12:00:00Z");
  assert.equal(isDue(undefined, 30, now), true);
  assert.equal(isDue("2026-11-10T12:00:00Z", 30, now), false, "10 days ago, 30-day interval");
  assert.equal(isDue("2026-10-01T12:00:00Z", 30, now), true, "52 days ago, 30-day interval");
  assert.equal(isDue("not-a-date", 30, now), true, "unparseable date treated as never run");
});

function costRecord(
  overrides: Partial<{
    amount: number;
    rangeLow: number;
    rangeHigh: number;
    retrieved: string;
    period: string;
  }> = {},
) {
  return {
    id: "tuition-statutory",
    amount: overrides.amount ?? 2694,
    rangeLow: overrides.rangeLow,
    rangeHigh: overrides.rangeHigh,
    provenance: {
      retrieved: overrides.retrieved ?? "2026-06-01",
      period: overrides.period ?? "2026-2027",
    },
  };
}

test("applyFigureUpdates re-stamps retrieved when a figure is unchanged", () => {
  const costs = [costRecord({ amount: 2694, retrieved: "2026-06-01" })];
  const result = applyFigureUpdates(
    costs,
    [{ costId: "tuition-statutory", amount: 2694, period: "2026-2027" }],
    "2026-11-22",
  );
  assert.equal(result.changed, false);
  assert.deepEqual(result.reverified, ["tuition-statutory"]);
  assert.equal(costs[0].provenance.retrieved, "2026-11-22");
});

test("applyFigureUpdates reports and applies changed figures", () => {
  const costs = [costRecord({ amount: 2500 })];
  const result = applyFigureUpdates(
    costs,
    [{ costId: "tuition-statutory", amount: 2694 }],
    "2026-11-22",
  );
  assert.equal(result.changed, true);
  assert.deepEqual(result.changes, [{ costId: "tuition-statutory", field: "amount", was: 2500, now: 2694 }]);
  assert.equal(costs[0].amount, 2694);
  assert.equal(costs[0].provenance.retrieved, "2026-11-22");
});

test("applyFigureUpdates flags figures with no matching record", () => {
  const result = applyFigureUpdates([], [{ costId: "mystery-fee", amount: 1 }], "2026-11-22");
  assert.equal(result.changed, true);
  assert.equal(result.changes[0].field, "(record)");
});

test("applyFigureUpdates writes period into provenance, not the record root", () => {
  const costs = [costRecord({ period: "2025-2026" })];
  const result = applyFigureUpdates(
    costs,
    [{ costId: "tuition-statutory", amount: 2694, period: "2026-2027" }],
    "2026-11-22",
  );
  assert.equal(result.changed, true);
  assert.deepEqual(result.changes, [
    { costId: "tuition-statutory", field: "provenance.period", was: "2025-2026", now: "2026-2027" },
  ]);
  assert.equal(costs[0].provenance.period, "2026-2027");
  assert.equal("period" in costs[0], false, "no stray top-level period key");
});
