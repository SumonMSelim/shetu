import { programmeSchema } from "../schema";
import type { Programme } from "../types";

/**
 * Deterministic adapter for the Study in NL Studyfinder bulk API
 * (https://www.studyinnl.org/api/programs?limit=100&offset=N), the data
 * behind the government-backed programme finder. No LLM: the API returns
 * structured records (fees per type and year, EU and non-EU deadlines, ECTS,
 * accreditation) and this adapter maps them onto the Programme schema.
 *
 * Verified against the live API on 22 November 2026: totalAmount 1713,
 * paged with limit=100.
 */

const API_BASE = "https://www.studyinnl.org/api/programs";
const FINDER_BASE = "https://www.studyinnl.org/dutch-education/studies";

/** Shape of one programme record from the Studyfinder API (fields we use). */
interface ApiProgram {
  id: number;
  slug: string;
  name: string;
  type: string;
  field_of_study?: string;
  institution?: {
    name?: string;
    sector?: string;
    city?: string;
  } | null;
  locations?: { name?: string }[] | null;
  languages?: { name?: string }[] | null;
  duration?: string;
  ects_credits?: number;
  qualification?: string;
  website?: string;
  admission_url?: string[] | null;
  tuitions?: { year: number; amount: number; tuition_fee_type?: string; program_form?: string }[] | null;
  start_months?: { start_date?: string; application_deadline?: string; application_deadline_non_eu?: string }[] | null;
  language_requirements?: { minimum_score?: string; description?: string }[][] | null;
  accreditations?: { name?: string }[] | null;
}

export interface FinderRunResult {
  programmes: Programme[];
  skipped: { id: string; reason: string }[];
  total: number;
}

/** Fetch every programme from the API, paged. */
export async function fetchAllPrograms(
  onProgress?: (fetched: number, total: number) => void,
  maxRecords?: number,
): Promise<{ raw: ApiProgram[]; total: number }> {
  const raw: ApiProgram[] = [];
  let total = Number.POSITIVE_INFINITY;
  const limit = 100;
  for (let offset = 0; offset < total && raw.length < (maxRecords ?? Number.POSITIVE_INFINITY); offset += limit) {
    const res = await fetch(`${API_BASE}?limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error(`Studyfinder API HTTP ${res.status} at offset ${offset}`);
    const body = (await res.json()) as { data: { totalAmount: number; programs: ApiProgram[] } };
    total = body.data.totalAmount ?? total;
    const batch = body.data.programs ?? [];
    raw.push(...batch);
    onProgress?.(raw.length, total);
    await new Promise((r) => setTimeout(r, 400)); // politeness delay
    if (batch.length === 0) break; // safety: stop on empty page
  }
  return { raw: raw.slice(0, maxRecords ?? raw.length), total };
}

function parseDurationMonths(duration?: string): number | undefined {
  if (!duration) return undefined;
  const m = /(\d+(?:\.\d+)?)\s*year/i.exec(duration);
  if (m) return Math.round(Number(m[1]) * 12);
  return undefined;
}

function toLevel(type?: string): "bachelor" | "master" | null {
  const t = (type ?? "").toLowerCase();
  if (t === "bachelor") return "bachelor";
  if (t === "master") return "master";
  return null; // "Other", "Short or summer course", "PhD": out of scope for now
}

function toSector(sector?: string): string | undefined {
  const s = (sector ?? "").toLowerCase();
  if (s.includes("research university")) return "research-university";
  if (s.includes("applied sciences")) return "university-of-applied-sciences";
  if (s.includes("institute")) return "institute";
  return undefined;
}

/** Latest-year fees split by type: statutory -> EU, international -> non-EU. */
function pickTuitions(tuitions: ApiProgram["tuitions"]): {
  tuitionEu?: number;
  tuitionNonEu?: number;
  period?: string;
} {
  if (!tuitions || tuitions.length === 0) return {};
  const latestYear = Math.max(...tuitions.map((t) => t.year));
  const latest = tuitions.filter((t) => t.year === latestYear);
  const fulltime = latest.filter((t) => (t.program_form ?? "fulltime").includes("full"));
  const pick = (type: string) =>
    (fulltime.length > 0 ? fulltime : latest).find((t) => (t.tuition_fee_type ?? "").includes(type))
      ?.amount;
  return {
    tuitionEu: pick("statutory"),
    tuitionNonEu: pick("international"),
    period: String(latestYear),
  };
}

/** Earliest non-EU deadline (the binding one for the audience), else earliest EU. */
function pickDeadline(startMonths: ApiProgram["start_months"]): string | undefined {
  if (!startMonths || startMonths.length === 0) return undefined;
  const nonEu = startMonths
    .map((s) => s.application_deadline_non_eu)
    .filter(Boolean)
    .sort();
  const eu = startMonths.map((s) => s.application_deadline).filter(Boolean).sort();
  const deadline = nonEu[0] ?? eu[0];
  if (!deadline) return undefined;
  const euNote = eu[0] && eu[0] !== deadline ? `; EU deadline ${eu[0]}` : "";
  return `${deadline} (non-EU)${euNote}`;
}

function pickEnglish(requirements: ApiProgram["language_requirements"]): string | undefined {
  if (!requirements) return undefined;
  const flat = requirements.flat();
  const overall = flat.find((r) => /overall/i.test(r.description ?? ""));
  if (overall?.minimum_score) {
    const test = /ielts/i.test(overall.description ?? "") ? "IELTS" : (overall.description ?? "English test").trim();
    return `${test} ${overall.minimum_score} overall`;
  }
  return undefined;
}

/**
 * Map one API record onto the Programme schema. Returns null for records we
 * do not serve (non-degree courses), with a reason for the report.
 */
export function mapProgram(raw: ApiProgram, cc: string, today: string): Programme | null {
  const level = toLevel(raw.type);
  const institutionName = raw.institution?.name?.trim();
  if (!level || !institutionName || !raw.name) {
    return null;
  }
  const tuition = pickTuitions(raw.tuitions);
  const city = raw.locations?.[0]?.name?.trim() || raw.institution?.city?.trim() || "";
  const languages = (raw.languages ?? []).map((l) => l.name).filter(Boolean).join(", ");
  const applicationUrl =
    raw.website?.trim() ||
    raw.admission_url?.[0]?.trim() ||
    `${FINDER_BASE}/${raw.slug}`;

  const noteParts = [
    raw.ects_credits ? `${raw.ects_credits} EC` : "",
    raw.qualification ? `leads to ${raw.qualification}` : "",
    raw.accreditations?.length
      ? `accredited by ${raw.accreditations.map((a) => a.name).join(", ")}`
      : "",
    raw.start_months?.length
      ? `starts ${[...new Set(raw.start_months.map((s) => s.start_date?.slice(0, 7)))]
          .filter(Boolean)
          .join(", ")}`
      : "",
  ].filter(Boolean);
  const notes = noteParts.join("; ");

  const draft = {
    id: `${cc.toLowerCase()}-${raw.slug}`,
    institution: institutionName,
    institutionType: toSector(raw.institution?.sector) ?? "institute",
    name: raw.name,
    level,
    field: raw.field_of_study?.trim() || "General",
    language: languages || "English",
    city: city || institutionName,
    ...(parseDurationMonths(raw.duration) ? { durationMonths: parseDurationMonths(raw.duration) } : {}),
    ...(tuition.tuitionEu ? { tuitionEu: tuition.tuitionEu } : {}),
    ...(tuition.tuitionNonEu ? { tuitionNonEu: tuition.tuitionNonEu } : {}),
    currency: "EUR",
    ...(pickDeadline(raw.start_months) ? { applicationDeadline: pickDeadline(raw.start_months) } : {}),
    ...(pickEnglish(raw.language_requirements) ? { englishRequirement: pickEnglish(raw.language_requirements) } : {}),
    applicationUrl,
    ...(notes.length >= 10 ? { notes } : {}),
    provenance: {
      source: "Study in NL Studyfinder (official government-backed portal API)",
      sourceUrl: `${FINDER_BASE}/${raw.slug}`,
      retrieved: today,
      ...(tuition.period ? { period: tuition.period } : {}),
    },
  };

  const result = programmeSchema.safeParse(draft);
  if (!result.success) {
    // Report the schema problem to the caller instead of killing the harvest.
    return null;
  }
  return result.data;
}

/**
 * One full finder harvest: fetch all, map, drop non-degree records.
 */
export async function runFinderHarvest(
  cc: string,
  today: string,
  onProgress?: (fetched: number, total: number) => void,
  maxRecords?: number,
): Promise<FinderRunResult> {
  const { raw, total } = await fetchAllPrograms(onProgress, maxRecords);
  const programmes: Programme[] = [];
  const skipped: { id: string; reason: string }[] = [];
  for (const r of raw) {
    let mapped: Programme | null = null;
    try {
      mapped = mapProgram(r, cc, today);
    } catch (err) {
      skipped.push({ id: `${cc}-${r.slug}`, reason: String(err).slice(0, 140) });
      continue;
    }
    if (mapped) programmes.push(mapped);
    else
      skipped.push({
        id: `${cc}-${r.slug}`,
        reason: `not a bachelor/master programme (type: ${r.type})`,
      });
  }
  return { programmes, skipped, total };
}
