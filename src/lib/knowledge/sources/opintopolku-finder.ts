import { programmeSchema } from "../schema";
import type { Programme } from "../types";

/**
 * Deterministic adapter for Finland's Opintopolku / Studyinfo search API
 * (the Finnish National Agency for Education):
 *   https://opintopolku.fi/konfo-backend/search/koulutukset?kieli=en&lng=en
 *
 * `kieli=en` (teaching language includes English) is a server-side filter:
 * 7,474 programmes, all with `kielivalinta` containing "en". No LLM.
 *
 * Mapping rules (honest subset):
 *   - the record must have an English name (nimi.en) and a detectable degree
 *     level from its qualification names (tutkintonimikkeet)
 *   - tuition fees are NOT in the search payload, so no fee figures appear
 *     (a per-implementation detail harvest can add them later)
 *   - the payload has no city, so city falls back to the institution name
 */

const API_BASE = "https://opintopolku.fi/konfo-backend/search/koulutukset";
const DETAIL_BASE = "https://opintopolku.fi/konfo/en/koulutus";

interface FiProgram {
  oid: string;
  nimi: { fi?: string; en?: string; sv?: string };
  koulutustyyppi?: string;
  kielivalinta?: string[];
  opintojenLaajuusNumero?: number;
  opintojenLaajuusyksikko?: { nimi?: { en?: string; fi?: string; sv?: string } } | null;
  toteutustenTarjoajat?: { nimi?: { fi?: string; sv?: string; en?: string } } | null;
  tutkintonimikkeet?: { nimi?: { fi?: string; en?: string; sv?: string } }[] | null;
}

function levelFromQualifications(quals: FiProgram["tutkintonimikkeet"]): "bachelor" | "master" | null {
  for (const q of quals ?? []) {
    const en = (q.nimi?.en ?? "").toLowerCase();
    const fi = (q.nimi?.fi ?? "").toLowerCase();
    if (/master|maisteri/i.test(en + " " + fi)) return "master";
    if (/bachelor|kandidaatti/i.test(en + " " + fi)) return "bachelor";
  }
  return null;
}

function creditsToMonths(credits?: number, unitEn?: string): number | undefined {
  if (!credits || credits <= 0) return undefined;
  if (unitEn && !/ects/i.test(unitEn)) return undefined;
  // Finnish degrees: 60 ECTS per academic year (bachelor 180 = 3 yrs,
  // master 120 = 2 yrs).
  return Math.round(credits / 5);
}

export function mapOpintopolku(raw: FiProgram, cc: string, today: string): Programme | null {
  const name = raw.nimi?.en?.trim();
  const level = levelFromQualifications(raw.tutkintonimikkeet);
  const languages = raw.kielivalinta ?? [];
  if (!name || !level || !languages.includes("en")) return null;

  const providerEn = raw.toteutustenTarjoajat?.nimi?.en?.trim();
  const providerFi = raw.toteutustenTarjoajat?.nimi?.fi?.trim();
  const institution = providerEn || providerFi || "Finnish higher education institution";
  const qualification = raw.tutkintonimikkeet?.[0]?.nimi?.en?.trim();
  const months = creditsToMonths(
    raw.opintojenLaajuusNumero,
    raw.opintojenLaajuusyksikko?.nimi?.en,
  );

  const noteParts = [
    raw.opintojenLaajuusNumero ? `${raw.opintojenLaajuusNumero} ECTS credits` : "",
    qualification ? `leads to ${qualification}` : "",
    raw.koulutustyyppi === "yo"
      ? "offered by a research university"
      : raw.koulutustyyppi === "amk"
        ? "offered by a university of applied sciences"
        : "",
  ].filter(Boolean);
  const notes = noteParts.join("; ");

  const draft = {
    id: `${cc.toLowerCase()}-${raw.oid.replace(/\./g, "-")}`,
    institution,
    institutionType:
      raw.koulutustyyppi === "amk"
        ? "university-of-applied-sciences"
        : raw.koulutustyyppi === "yo"
          ? "research-university"
          : "institute",
    name,
    level,
    field: "General",
    language: languages.map((l) => (l === "en" ? "English" : l === "fi" ? "Finnish" : l === "sv" ? "Swedish" : l)).join(", "),
    city: institution,
    ...(months ? { durationMonths: months } : {}),
    currency: "EUR",
    applicationUrl: `${DETAIL_BASE}/${raw.oid}`,
    ...(notes.length >= 10 ? { notes } : {}),
    provenance: {
      source: "Opintopolku / Studyinfo (Finnish National Agency for Education)",
      sourceUrl: `${DETAIL_BASE}/${raw.oid}`,
      retrieved: today,
    },
  };

  const result = programmeSchema.safeParse(draft);
  if (!result.success) return null;
  return result.data;
}

export interface OpintopolkuRunResult {
  programmes: Programme[];
  skipped: { id: string; reason: string }[];
  total: number;
}

export async function runOpintopolkuHarvest(
  cc: string,
  today: string,
  onProgress?: (fetched: number, total: number) => void,
  maxRecords?: number,
): Promise<OpintopolkuRunResult> {
  const programmes: Programme[] = [];
  const skipped: { id: string; reason: string }[] = [];
  let total = Number.POSITIVE_INFINITY;
  const limit = 100;

  for (let page = 1; (page - 1) * limit < total && programmes.length + skipped.length < (maxRecords ?? Number.POSITIVE_INFINITY); page++) {
    const res = await fetch(`${API_BASE}?lng=en&page=${page}&size=${limit}&sort=score&kieli=en`, {
      headers: { "User-Agent": "Mozilla/5.0" },
    });
    if (!res.ok) throw new Error(`Opintopolku API HTTP ${res.status} on page ${page}`);
    const body = (await res.json()) as { total: number; hits: FiProgram[] };
    total = body.total ?? total;
    const batch = body.hits ?? [];
    if (batch.length === 0) break;
    for (const r of batch) {
      const mapped = mapOpintopolku(r, cc, today);
      if (mapped) programmes.push(mapped);
      else
        skipped.push({
          id: `${cc}-${r.oid.slice(-8)}`,
          reason: "no English name, no degree level, or not English-taught",
        });
    }
    onProgress?.(page * limit, total);
    await new Promise((r2) => setTimeout(r2, 400));
  }
  return { programmes, skipped, total };
}
