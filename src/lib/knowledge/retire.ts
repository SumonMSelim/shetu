import { FRESHNESS_DAYS, isStaleProvenance } from "./schema";

/**
 * Old-data cleanup logic (pure, unit-tested).
 *
 * Records past the freshness budget are stale: retrieval marks them so the
 * answering model says so, and the cleanup command can retire them. Retired
 * records move to data/countries/<CC>/retired/<collection>.json: out of the
 * serving path, still in git for audit. Nothing is silently deleted.
 */

export interface HasProvenance {
  id: string;
  provenance?: { retrieved: string };
}

export function partitionByStaleness<T extends HasProvenance>(
  records: T[],
  now: Date = new Date(),
): { stale: T[]; current: T[] } {
  const stale: T[] = [];
  const current: T[] = [];
  for (const r of records) {
    // Records without a verification date (editorial content such as red
    // flags) are not time-sensitive and stay current.
    (r.provenance && isStaleProvenance(r.provenance, now) ? stale : current).push(r);
  }
  return { stale, current };
}

export function daysSince(retrieved: string, now: Date = new Date()): number {
  const t = new Date(retrieved).getTime();
  if (Number.isNaN(t)) return Number.POSITIVE_INFINITY;
  return Math.floor((now.getTime() - t) / 86_400_000);
}

/**
 * Mark records as retired: adds retirement metadata the audit trail keeps,
 * without touching provenance.
 */
export function markRetired<T extends HasProvenance>(
  records: T[],
  reason: string,
  now: Date = new Date(),
): (T & { retiredOn: string; retiredReason: string })[] {
  return records.map((r) => ({
    ...r,
    retiredOn: now.toISOString().slice(0, 10),
    retiredReason: reason,
  }));
}

export { FRESHNESS_DAYS };
