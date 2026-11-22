import { test } from "node:test";
import assert from "node:assert/strict";
import { TurnTraceCollector } from "../src/lib/observability/trace";

/**
 * Trace collector tests.
 *
 * The collector is the capture side of the audit trail: it must account for
 * every model call's tokens, time each tool call, attribute specialists, and
 * record failures. These tests feed it synthetic SDK-shaped events.
 */

test("accumulates token usage across model metadata events", () => {
  const c = new TurnTraceCollector();
  c.onModelStreamEvent({
    type: "modelMetadataEvent",
    usage: { inputTokens: 100, outputTokens: 40, totalTokens: 140 },
  });
  c.onModelStreamEvent({
    type: "modelMetadataEvent",
    usage: { inputTokens: 50, outputTokens: 10, totalTokens: 60, cacheReadInputTokens: 20 },
    metrics: { latencyMs: 812 },
  });
  const t = c.finish("u1", "c1", 0);
  assert.equal(t.modelCalls.length, 2);
  assert.equal(t.totals.inputTokens, 150);
  assert.equal(t.totals.outputTokens, 50);
  assert.equal(t.totals.totalTokens, 200);
  assert.equal(t.totals.cacheReadInputTokens, 20);
  assert.equal(t.modelCalls[1].latencyMs, 812);
});

test("ignores non-metadata events and metadata without usage", () => {
  const c = new TurnTraceCollector();
  c.onModelStreamEvent({ type: "modelContentBlockDeltaEvent" });
  c.onModelStreamEvent({ type: "modelMetadataEvent" });
  const t = c.finish("u1", "c1", 0);
  assert.equal(t.modelCalls.length, 0);
  assert.deepEqual(t.totals, { inputTokens: 0, outputTokens: 0, totalTokens: 0 });
});

test("times tool calls and records errors", () => {
  const c = new TurnTraceCollector();
  c.onBeforeToolCall({ name: "get_costs", toolUseId: "t1" });
  c.onAfterToolCall({ name: "get_costs", toolUseId: "t1" });
  c.onBeforeToolCall({ name: "vault_read", toolUseId: "t2" });
  c.onAfterToolCall({ name: "vault_read", toolUseId: "t2" }, new Error("boom"));
  const t = c.finish("u1", "c1", 0);
  assert.equal(t.toolCalls.length, 2);
  assert.equal(t.toolCalls[0].name, "get_costs");
  assert.equal(t.toolCalls[0].ok, true);
  assert.equal(t.toolCalls[1].ok, false);
  assert.equal(t.toolCalls[1].error, "boom");
});

test("attributes specialists separately from plain tools", () => {
  const c = new TurnTraceCollector();
  c.onBeforeToolCall({ name: "cost_scam_guard", toolUseId: "s1" });
  c.onBeforeToolCall({ name: "get_costs", toolUseId: "t1" });
  const t = c.finish("u1", "c1", 0);
  assert.deepEqual(t.specialists, ["cost_scam_guard"]);
});

test("records stop reason, turn number, and errors", () => {
  const c = new TurnTraceCollector();
  c.onAgentResult({ stopReason: "endTurn" });
  const ok = c.finish("u1", "c1", 3);
  assert.equal(ok.stopReason, "endTurn");
  assert.equal(ok.turn, 3);
  assert.equal(ok.error, undefined);

  const failed = new TurnTraceCollector().finish("u1", "c1", 4, new Error("throttled"));
  assert.equal(failed.error, "throttled");
});
