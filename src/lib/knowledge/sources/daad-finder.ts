import { chromium } from "playwright";
import { programmeSchema } from "../schema";
import type { Programme } from "../types";

/**
 * Deterministic adapter for the DAAD International Programmes database
 * (Germany): https://www2.daad.de/deutschland/studienangebote/international-programmes/
 *
 * The database exposes a Solr JSON API, but it only serves requests carrying
 * the finder page's session context (plain curl gets a WAF 403), so this
 * adapter loads the finder page once in a headless browser and then pulls the
 * JSON API through that session's request context. No LLM.
 *
 * Verified live on 22 November 2026: 2,141 degree programmes (courseType 1 =
 * bachelor, 2 = master), paged with limit=100.
 */

const FINDER_URL =
  "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/";
const SEARCH_BASE =
  "https://www2.daad.de/deutschland/studienangebote/international-programmes/api/solr/en/search.json";

interface DaadCourse {
  id: number;
  courseName?: string;
  academy?: string;
  city?: string;
  languages?: string[] | null;
  languageLevelEnglish?: string[] | null;
  programmeDuration?: string | null;
  tuitionFees?: string | null;
  applicationDeadline?: string | null;
  financialSupport?: string | null;
  subject?: string | null;
  courseType?: number;
  link?: string | null;
}

export interface DaadRunResult {
  programmes: Programme[];
  skipped: { id: string; reason: string }[];
  total: number;
}

/** Heuristic institution type from the academy name (deterministic, in code). */
export function daadInstitutionType(academy: string): string {
  const a = academy.toLowerCase();
  if (/applied sciences|hochschule/i.test(a)) return "university-of-applied-sciences";
  if (/universit|college|rptu|tu /i.test(a)) return "research-university";
  return "institute";
}

function parseDurationMonths(duration?: string | null): number | undefined {
  if (!duration) return undefined;
  const sem = /(\d+)\s*semester/i.exec(duration);
  if (sem) return Number(sem[1]) * 6;
  const yr = /(\d+(?:\.\d+)?)\s*year/i.exec(duration);
  if (yr) return Math.round(Number(yr[1]) * 12);
  return undefined;
}

function toLevel(courseType?: number): "bachelor" | "master" | null {
  if (courseType === 1) return "bachelor";
  if (courseType === 2) return "master";
  return null;
}

export function mapDaad(raw: DaadCourse, today: string): Programme | null {
  const level = toLevel(raw.courseType);
  const name = raw.courseName?.trim();
  const academy = raw.academy?.trim();
  if (!level || !name || !academy) return null;

  const noteParts: string[] = [];
  if (raw.tuitionFees) noteParts.push(`fees per DAAD: ${raw.tuitionFees}`);
  if (raw.financialSupport) noteParts.push(`financial support listed: ${raw.financialSupport}`);
  if (raw.link) noteParts.push("application and admission details on the DAAD detail page");

  const draft = {
    id: `de-daad-${raw.id}`,
    institution: academy,
    institutionType: daadInstitutionType(academy),
    name,
    level,
    field: raw.subject?.trim() || "General",
    language: (raw.languages ?? []).filter(Boolean).join(", ") || "English",
    city: raw.city?.trim() || academy,
    ...(parseDurationMonths(raw.programmeDuration)
      ? { durationMonths: parseDurationMonths(raw.programmeDuration) }
      : {}),
    currency: "EUR",
    ...(raw.applicationDeadline ? { applicationDeadline: raw.applicationDeadline } : {}),
    ...(raw.languageLevelEnglish?.length
      ? { englishRequirement: `English CEFR ${(raw.languageLevelEnglish ?? []).join("/")}` }
      : {}),
    applicationUrl: raw.link
      ? `https://www2.daad.de${raw.link}`
      : "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/",
    ...(noteParts.length > 0 ? { notes: noteParts.join("; ") } : {}),
    provenance: {
      source: "DAAD International Programmes database (official DAAD portal)",
      sourceUrl: raw.link
        ? `https://www2.daad.de${raw.link}`
        : "https://www2.daad.de/deutschland/studienangebote/international-programmes/en/",
      retrieved: today,
    },
  };

  const result = programmeSchema.safeParse(draft);
  if (!result.success) return null;
  return result.data;
}

/** Full DAAD harvest: browser session for context, then paged JSON pulls. */
export async function runDaadHarvest(
  today: string,
  onProgress?: (fetched: number, total: number) => void,
  maxRecords?: number,
): Promise<DaadRunResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(FINDER_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(5000); // session cookies for the API calls

  const fetchPage = async (offset: number) => {
    const url =
      `${SEARCH_BASE}?cert=&admReq=&langExamPC=&langExamLC=&langExamSC=` +
      `&langDeAvailable=&langEnAvailable=&fee=&sort=4&dur=&q=` +
      `&degree%5B%5D=1&degree%5B%5D=2&limit=100&offset=${offset}`;
    const res = await page.request.get(url);
    if (!res.ok) throw new Error(`DAAD API HTTP ${res.status} at offset ${offset}`);
    const body = (await res.json()) as { courses: DaadCourse[]; numResults: number };
    return body;
  };

  try {
    const first = await fetchPage(0);
    const total = first.numResults ?? first.courses.length;
    const raw: DaadCourse[] = [...first.courses];
    onProgress?.(raw.length, total);
    for (let offset = 100; offset < total && raw.length < (maxRecords ?? Number.POSITIVE_INFINITY); offset += 100) {
      const pageData = await fetchPage(offset);
      if (pageData.courses.length === 0) break;
      raw.push(...pageData.courses);
      onProgress?.(raw.length, total);
      await new Promise((r) => setTimeout(r, 400));
    }
    const programmes: Programme[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const course of raw.slice(0, maxRecords ?? raw.length)) {
      const mapped = mapDaad(course, today);
      if (mapped) programmes.push(mapped);
      else
        skipped.push({
          id: `de-daad-${course.id}`,
          reason: `not a bachelor/master programme (courseType: ${course.courseType})`,
        });
    }
    return { programmes, skipped, total };
  } finally {
    await browser.close();
  }
}
