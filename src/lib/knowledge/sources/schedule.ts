import type { CostFigureUpdate } from "../schema";

/**
 * Scheduler and merge logic for the harvesting pipeline (pure, unit-tested).
 *
 * A source is due when it has never run or its interval has elapsed since the
 * last successful run. Extracted figures merge into cost records: an unchanged
 * figure just re-stamps `retrieved` (a fresh verification); a changed figure
 * updates the record and is reported so the human reviews it in the PR.
 */

export function isDue(
  lastRunAt: string | undefined,
  intervalDays: number,
  now: Date = new Date(),
): boolean {
  if (!lastRunAt) return true;
  const last = new Date(lastRunAt).getTime();
  // An unparseable last-run date is treated as never run: fail open, re-check.
  if (Number.isNaN(last)) return true;
  const elapsed = now.getTime() - last;
  return elapsed >= intervalDays * 86_400_000;
}

export interface FigureChange {
  costId: string;
  field: string;
  was: number | string | undefined;
  now: number | string | undefined;
}

export interface ApplyResult {
  /** True when any figure's value changed (not just re-verified). */
  changed: boolean;
  changes: FigureChange[];
  reverified: string[];
}

/** Apply extracted figures to the cost records list, in place. */
export function applyFigureUpdates(
  costs: {
    id: string;
    amount?: number;
    rangeLow?: number;
    rangeHigh?: number;
    provenance: { retrieved: string; period?: string };
  }[],
  figures: CostFigureUpdate[],
  today: string,
): ApplyResult {
  const changes: FigureChange[] = [];
  const reverified: string[] = [];
  let changed = false;

  for (const figure of figures) {
    const record = costs.find((c) => c.id === figure.costId);
    if (!record) {
      changes.push({ costId: figure.costId, field: "(record)", was: undefined, now: undefined });
      changed = true;
      continue;
    }
    for (const field of ["amount", "rangeLow", "rangeHigh"] as const) {
      const next = figure[field];
      if (next === undefined) continue;
      const was = record[field];
      if (was !== next) {
        (record as Record<string, unknown>)[field] = next;
        changes.push({
          costId: figure.costId,
          field,
          was: was as number | undefined,
          now: next as number | undefined,
        });
        changed = true;
      }
    }
    // `period` belongs inside provenance (the period the figure applies to).
    if (figure.period !== undefined && record.provenance.period !== figure.period) {
      const was = record.provenance.period;
      record.provenance.period = figure.period;
      changes.push({ costId: figure.costId, field: "provenance.period", was, now: figure.period });
      changed = true;
    }
    record.provenance.retrieved = today;
    if (!changes.some((c) => c.costId === figure.costId)) {
      reverified.push(figure.costId);
    }
  }
  return { changed, changes, reverified };
}
