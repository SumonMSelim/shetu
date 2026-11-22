/**
 * Turn trace capture.
 *
 * The chat stream loop already sees every agent event. This collector turns
 * those events into one append-only audit record per turn: which model calls
 * ran, with what token usage and latency, which tools and specialists were
 * used, and how the turn ended. The record is persisted as a TRACE# item (see
 * repository.ts) and powers cost tracking, citation auditing, and the offline
 * evaluation suite. It stores no message content; messages live in their own
 * records and the trace references them by conversation and turn number.
 *
 * Event shapes are duck-typed (no SDK imports at runtime) so this module stays
 * testable in isolation and tolerant of small SDK type changes.
 */

export interface TraceModelCall {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheReadInputTokens?: number;
  latencyMs?: number;
  at: string;
}

export interface TraceToolCall {
  name: string;
  durationMs: number;
  ok: boolean;
  error?: string;
}

export interface TurnTrace {
  userId: string;
  convId: string;
  /** Zero-based turn index within the conversation (matches message seq). */
  turn: number;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  modelCalls: TraceModelCall[];
  toolCalls: TraceToolCall[];
  specialists: string[];
  stopReason?: string;
  error?: string;
  totals: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    cacheReadInputTokens?: number;
  };
}

/** The specialist agents-as-tools, for attribution in the trace. */
const SPECIALIST_NAMES = new Set([
  "readiness_specialist",
  "opportunity_matcher",
  "cost_scam_guard",
  "document_coach",
  "ielts_prep",
]);

/** The part of a model stream event the collector reads. */
export interface ModelEventLike {
  type?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    cacheReadInputTokens?: number;
  };
  metrics?: { latencyMs?: number };
}

/** The part of a tool-use payload the collector reads. */
export interface ToolUseLike {
  name?: string;
  toolUseId?: string;
}

export class TurnTraceCollector {
  private readonly started = Date.now();
  private readonly modelCalls: TraceModelCall[] = [];
  private readonly toolCalls: TraceToolCall[] = [];
  private readonly specialists = new Set<string>();
  /** toolUseId -> start time, so overlapping tool calls stay independent. */
  private readonly openTools = new Map<string, number>();
  private stopReason?: string;

  /** Feed the inner event of a modelStreamUpdateEvent. */
  onModelStreamEvent(inner: ModelEventLike): void {
    if (inner?.type !== "modelMetadataEvent" || !inner.usage) return;
    const u = inner.usage;
    this.modelCalls.push({
      inputTokens: u.inputTokens ?? 0,
      outputTokens: u.outputTokens ?? 0,
      totalTokens: u.totalTokens ?? 0,
      ...(u.cacheReadInputTokens !== undefined
        ? { cacheReadInputTokens: u.cacheReadInputTokens }
        : {}),
      ...(inner.metrics?.latencyMs !== undefined
        ? { latencyMs: inner.metrics.latencyMs }
        : {}),
      at: new Date().toISOString(),
    });
  }

  onBeforeToolCall(toolUse: ToolUseLike | undefined): void {
    if (!toolUse?.name) return;
    if (SPECIALIST_NAMES.has(toolUse.name)) this.specialists.add(toolUse.name);
    this.openTools.set(toolUse.toolUseId ?? toolUse.name, Date.now());
  }

  onAfterToolCall(toolUse: ToolUseLike | undefined, error?: unknown): void {
    const name = toolUse?.name;
    if (!name) return;
    const key = toolUse?.toolUseId ?? name;
    const start = this.openTools.get(key);
    this.openTools.delete(key);
    this.toolCalls.push({
      name,
      durationMs: start ? Date.now() - start : 0,
      ok: !error,
      ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
    });
  }

  onAgentResult(result: { stopReason?: string } | undefined): void {
    this.stopReason = result?.stopReason;
  }

  /** Build the final trace. `error` records a failed turn. */
  finish(userId: string, convId: string, turn: number, error?: unknown): TurnTrace {
    const finishedAt = new Date().toISOString();
    const totals = this.modelCalls.reduce(
      (acc, c) => {
        acc.inputTokens += c.inputTokens;
        acc.outputTokens += c.outputTokens;
        acc.totalTokens += c.totalTokens;
        if (c.cacheReadInputTokens !== undefined) {
          acc.cacheReadInputTokens = (acc.cacheReadInputTokens ?? 0) + c.cacheReadInputTokens;
        }
        return acc;
      },
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 } as {
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        cacheReadInputTokens?: number;
      },
    );
    return {
      userId,
      convId,
      turn,
      startedAt: new Date(this.started).toISOString(),
      finishedAt,
      durationMs: Date.now() - this.started,
      modelCalls: this.modelCalls,
      toolCalls: this.toolCalls,
      specialists: [...this.specialists],
      ...(this.stopReason ? { stopReason: this.stopReason } : {}),
      ...(error ? { error: error instanceof Error ? error.message : String(error) } : {}),
      totals,
    };
  }
}
