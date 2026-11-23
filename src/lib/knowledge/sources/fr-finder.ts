import { programmeSchema } from "../schema";
import type { Programme } from "../types";

/**
 * Deterministic adapter for France: the TaughtIE / Campus France catalogue
 * (https://taughtie.campusfrance.org/tiesearch/#/catalog), the official
 * English-taught programme database run by Campus France. Two-phase:
 *   1. GET https://tie-api.campusfrance.org/sgetprograms/1  (the full list,
 *      1,234 English-taught programmes, verified live on 23 November 2026)
 *   2. GET https://tie-api.campusfrance.org/sgetprogram/<id>  (per-programme
 *      detail: fee text, English proficiency, length, URLs)
 * No LLM, no browser.
 *
 * Level mapping (data-driven, honest subset): title-keyword correlation
 * shows levelObtainedId 12 = bachelor (61/67 "bachelor"-titled), 26 =
 * master (647/826 "master"-titled). All other ids are unverifiable from
 * the API and are SKIPPED, not guessed (the FI precedent).
 * Fee text is kept verbatim in notes: the catalogue does not state which
 * students pay it, so no numeric fee figure is mapped.
 */

const LIST_URL = "https://tie-api.campusfrance.org/sgetprograms/1";
const DETAIL_URL = "https://tie-api.campusfrance.org/sgetprogram/";
const CATALOGUE_URL = "https://taughtie.campusfrance.org/tiesearch/#/catalog";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";

interface FrListProgram {
  programId: number;
  programLabel?: string;
  institutionLabel?: string;
  institutionCity?: string;
  levelObtainedId?: number;
}

interface FrProgramDetail {
  diplomaEn?: string;
  lengthProgram?: string;
  fee?: string;
  proficiencyEn?: string;
  website?: string;
  websiteEn?: number;
  webdiploma?: string;
  webdiplomaEn?: number;
  institutionCity?: string;
  admission?: string;
  hasEcts?: number;
}

const LEVEL_BY_ID: Record<number, Programme["level"]> = { 12: "bachelor", 26: "master" };

const stripHtml = (html: string): string =>
  html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function mapFrProgram(
  list: FrListProgram,
  detail: FrProgramDetail | null,
  today: string,
): Programme | null {
  const level = LEVEL_BY_ID[list.levelObtainedId ?? -1];
  const name = list.programLabel?.trim();
  const institution = list.institutionLabel?.trim();
  if (!level || !name || !institution) return null;

  const city = list.institutionCity?.trim() || institution;
  const detailUrl = `${DETAIL_URL}${list.programId}`;

  // Fee text: kept verbatim (the catalogue does not state which students pay).
  const feeText = detail?.fee?.trim();
  const proficiency = detail?.proficiencyEn ? stripHtml(detail.proficiencyEn) : "";
  const admission = detail?.admission ? stripHtml(detail.admission) : "";
  const applicationUrl =
    (detail?.webdiplomaEn === 1 && detail?.webdiploma?.trim()) ||
    detail?.website?.trim() ||
    CATALOGUE_URL;

  const noteParts = [
    feeText ? `fees per TaughtIE: ${feeText}` : "",
    detail?.lengthProgram ? `programme length: ${detail.lengthProgram}` : "",
    admission ? `admission: ${admission.slice(0, 200)}` : "",
  ].filter(Boolean);
  const notes = noteParts.join("; ");

  const draft = {
    id: `fr-${list.programId}`,
    institution,
    institutionType: /universit/i.test(institution) ? "research-university" : "school",
    name,
    level,
    field: "General",
    language: "English",
    city,
    currency: "EUR",
    applicationUrl,
    ...(notes.length >= 10 ? { notes } : {}),
    provenance: {
      source: "TaughtIE / Campus France catalogue (official Campus France English-taught database)",
      sourceUrl: CATALOGUE_URL,
      retrieved: today,
    },
  };

  const result = programmeSchema.safeParse(draft);
  if (!result.success) return null;
  return result.data;
}

export interface FrRunResult {
  programmes: Programme[];
  skipped: { id: string; reason: string }[];
  total: number;
}

export async function runFrFinderHarvest(
  cc: string,
  today: string,
  onProgress?: (fetched: number, total: number) => void,
  maxRecords?: number,
): Promise<FrRunResult> {
  const listRes = await fetch(LIST_URL, { headers: { "User-Agent": UA } });
  if (!listRes.ok) throw new Error(`TaughtIE list HTTP ${listRes.status}`);
  const listBody = (await listRes.json()) as { programs: FrListProgram[] };
  const list = listBody.programs ?? [];
  const total = list.length;

  const programmes: Programme[] = [];
  const skipped: { id: string; reason: string }[] = [];
  let done = 0;

  for (const item of list.slice(0, maxRecords ?? list.length)) {
    const level = LEVEL_BY_ID[item.levelObtainedId ?? -1];
    if (!level) {
      skipped.push({ id: `fr-${item.programId}`, reason: `level id ${item.levelObtainedId} not verifiable` });
      done += 1;
      continue;
    }
    try {
      const res = await fetch(`${DETAIL_URL}${item.programId}`, { headers: { "User-Agent": UA } });
      const detail = res.ok ? ((await res.json()) as FrProgramDetail) : null;
      const mapped = mapFrProgram(item, detail, today);
      if (mapped) programmes.push(mapped);
      else skipped.push({ id: `fr-${item.programId}`, reason: "schema mismatch after mapping" });
    } catch (err) {
      skipped.push({ id: `fr-${item.programId}`, reason: String(err).slice(0, 100) });
    }
    done += 1;
    if (done % 50 === 0) onProgress?.(done, total);
    await new Promise((r) => setTimeout(r, 250));
  }
  return { programmes, skipped, total };
}
