import { test } from "node:test";
import assert from "node:assert/strict";
import {
  extractHosts,
  sanitizeAnswerLinks,
  ThinkingFilter,
} from "../src/lib/agent/answer-filter";

/**
 * Answer filter tests (Track E hardening): Nova-family reasoning suppression
 * and the invented-link sanitizer. Tags split across stream deltas must be
 * handled, because the chat stream pushes arbitrary fragments.
 */

test("ThinkingFilter suppresses complete thinking blocks", () => {
  const f = new ThinkingFilter();
  assert.equal(f.push("before<thinking>secret reasoning</thinking>after"), "beforeafter");
});

test("ThinkingFilter holds partial tags split across deltas", () => {
  const f = new ThinkingFilter();
  assert.equal(f.push("hello <thi"), "hello ", "text before the partial tag streams; the partial tag is held");
  assert.equal(f.push("nking>hidden"), "", "the tag completed across deltas: inside thinking now");
  assert.equal(f.push("</thinking>world"), "world");
});

test("ThinkingFilter suppresses blocks split across many deltas", () => {
  const f = new ThinkingFilter();
  let out = "";
  for (const d of ["A", "<", "think", "ing>", "S", "EC", "RET", "</", "think", "ing>", "B"]) {
    out += f.push(d);
  }
  out += f.flush();
  assert.equal(out, "AB", "nothing inside the thinking block may leak");
});

test("ThinkingFilter emits text outside thinking and flushes the tail", () => {
  const f = new ThinkingFilter();
  let out = f.push("start <thinking>x");
  out += f.flush();
  assert.equal(out, "start ", "an unterminated thinking block stays suppressed");
});

test("sanitizeAnswerLinks reduces links on unknown domains to their text", () => {
  const answer =
    "See [the official page](https://www.ind.nl/en/study) and [cost_scam_guard](https://shetu.app/cost-scam-guard).";
  const clean = sanitizeAnswerLinks(answer, ["ind.nl", "mol.la"]);
  assert.equal(
    clean,
    "See [the official page](https://www.ind.nl/en/study) and cost_scam_guard.",
  );
});

test("sanitizeAnswerLinks keeps subdomains and www variants of allowed hosts", () => {
  const answer =
    "[Study in NL](https://www.studyinnl.org/finances/tuition-fees) and [Shetu](https://shetu.mol.la/account)";
  assert.equal(sanitizeAnswerLinks(answer, ["studyinnl.org", "mol.la"]), answer);
});

test("sanitizeAnswerLinks leaves plain text untouched", () => {
  const answer = "No links here, just text about €2,694.";
  assert.equal(sanitizeAnswerLinks(answer, ["mol.la"]), answer);
});

test("extractHosts pulls hosts from tool output JSON", () => {
  const hosts = extractHosts(
    '{"url": "https://www.rug.nl/masters/arts-and-culture/", "other": "https://studyinnl.org/x"}',
  );
  assert.deepEqual(hosts.sort(), ["rug.nl", "studyinnl.org"]);
});
