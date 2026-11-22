import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkExpectations,
  checkGrounding,
  extractFigures,
  normalizeDigits,
} from "../src/lib/evals/checks";

/**
 * Eval gate tests (Track E): the deterministic assertions that decide pass or
 * fail. Bangla digits normalize before comparison so translated answers stay
 * verifiable.
 */

test("extractFigures pulls 3+ digit figures and normalizes separators", () => {
  assert.deepEqual(extractFigures("Tuition is €2,694 per year, plus €13,569 proof of funds."), [
    "2694",
    "13569",
  ]);
  assert.deepEqual(extractFigures("IELTS band 6.5 overall."), [], "two-digit figures are below the assertion threshold");
});

test("extractFigures converts Bengali numerals", () => {
  assert.deepEqual(extractFigures("মোট খরচ ১৩,৫৬৯ ইউরো।"), ["13569"]);
});

test("normalizeDigits maps Bengali numerals only", () => {
  assert.equal(normalizeDigits("২০২৬"), "2026");
  assert.equal(normalizeDigits("abc"), "abc");
});

test("checkGrounding passes when every figure appears in tool outputs", () => {
  const answer = "Statutory tuition is €2,694 for 2026-2027 and you must show €13,569.";
  const tools = ['{"amount": 2694, "period": "2026-2027"}', '{"amount": 13569}'];
  const result = checkGrounding(answer, tools);
  assert.equal(result.pass, true);
  assert.deepEqual(result.ungrounded, []);
});

test("checkGrounding flags invented figures", () => {
  const result = checkGrounding("The MSc costs €14,999 per year.", ['{"amount": 2694}']);
  assert.equal(result.pass, false);
  assert.deepEqual(result.ungrounded, ["14999"]);
});

test("checkExpectations enforces phrases, tools, specialists and scripts", () => {
  const result = checkExpectations(
    "That is a red flag. No one can guarantee a visa.",
    ["get_red_flags", "cost_scam_guard"],
    {
      mustContain: ["red flag"],
      mustNotContain: ["you should pay"],
      toolsMustInclude: ["get_red_flags"],
      specialistsMustInclude: ["cost_scam_guard"],
    },
  );
  assert.equal(result.pass, true);
});

test("checkExpectations fails loudly on every violated rule", () => {
  const result = checkExpectations("Looks fine to me.", [], {
    mustContain: ["red flag"],
    mustNotContain: ["fine"],
    toolsMustInclude: ["get_red_flags"],
    specialistsMustInclude: ["cost_scam_guard"],
    bengaliScript: true,
    noEnglishSwitch: true,
  });
  assert.equal(result.pass, false);
  assert.ok(result.failures.some((f) => f.includes("red flag")));
  assert.ok(result.failures.some((f) => f.includes("forbidden phrase")));
  assert.ok(result.failures.some((f) => f.includes("get_red_flags")));
  assert.ok(result.failures.some((f) => f.includes("cost_scam_guard")));
  assert.ok(result.failures.some((f) => f.includes("Bengali script")));
});
