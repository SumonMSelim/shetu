import type { Programme } from "./types";
import type { Provenance } from "./types";

/**
 * Retrieval helpers for DB-backed programme search (pure, unit-tested).
 *
 * Hybrid retrieval design: keyword full-text ranking and vector similarity
 * each produce a candidate list; reciprocal rank fusion (RRF) merges them
 * into one deterministic ordering. Records stay structured: vectors only
 * select candidates, the facts come from the validated rows.
 */

export interface DbProgrammeRow {
  id: string;
  name: string;
  institution: string;
  institution_type: string;
  level: string;
  field: string;
  language: string;
  city: string;
  duration_months: number | null;
  tuition_eu: string | number | null;
  tuition_non_eu: string | number | null;
  application_deadline: string | null;
  english_requirement: string | null;
  application_url: string;
  notes: string | null;
  provenance: string | Provenance;
  verified_on: string;
  stale: boolean;
}

/** Map a database row onto the Programme shape the agents already use. */
export function rowToProgramme(row: DbProgrammeRow): Programme & {
  verifiedOn: string;
  stale: boolean;
} {
  const provenance =
    typeof row.provenance === "string"
      ? (JSON.parse(row.provenance) as Provenance)
      : row.provenance;
  return {
    id: row.id,
    name: row.name,
    institution: row.institution,
    institutionType: row.institution_type,
    level: row.level as Programme["level"],
    field: row.field,
    language: row.language,
    city: row.city,
    ...(row.duration_months !== null ? { durationMonths: row.duration_months } : {}),
    ...(row.tuition_eu !== null ? { tuitionEu: Number(row.tuition_eu) } : {}),
    ...(row.tuition_non_eu !== null ? { tuitionNonEu: Number(row.tuition_non_eu) } : {}),
    ...(row.application_deadline ? { applicationDeadline: row.application_deadline } : {}),
    ...(row.english_requirement ? { englishRequirement: row.english_requirement } : {}),
    applicationUrl: row.application_url,
    ...(row.notes ? { notes: row.notes } : {}),
    // Single-currency catalogue today; a currency column arrives with the
    // first non-EUR country.
    currency: "EUR",
    provenance,
    verifiedOn: row.verified_on,
    stale: row.stale,
  };
}

/**
 * Reciprocal rank fusion: merge two ordered candidate lists into one. An id
 * found at rank r in a list scores 1 / (k + r); scores from both lists add.
 * Deterministic and independent of score scales.
 */
export function fuseResults<T extends { id: string }>(a: T[], b: T[], k = 60): T[] {
  const scores = new Map<string, number>();
  const byId = new Map<string, T>();
  const add = (list: T[]) => {
    list.forEach((item, rank) => {
      scores.set(item.id, (scores.get(item.id) ?? 0) + 1 / (k + rank));
      if (!byId.has(item.id)) byId.set(item.id, item);
    });
  };
  add(a);
  add(b);
  return [...scores.entries()]
    .sort((x, y) => y[1] - x[1])
    .map(([id]) => byId.get(id)!)
    .filter(Boolean);
}
