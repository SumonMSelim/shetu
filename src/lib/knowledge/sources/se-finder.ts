import { chromium } from "playwright";
import { programmeSchema } from "../schema";
import type { Programme } from "../types";

/**
 * Deterministic adapter for Sweden: the University Admissions in Sweden (UHR)
 * course search API (https://www.universityadmissions.se/intl/search).
 *
 * The search page is a JS app whose results come from
 *   POST /intl/api/sok  { sortering, sokfilter, sida, antalVisade }
 * The API requires the page's session context (like DAAD), so the adapter
 * loads the search page once in a headless browser and posts through that
 * session. Two sweeps: master's level (avanceradNiva) and bachelor's level
 * (grundNiva). No LLM.
 *
 * Verified live on 22 November 2026: 1,120 English-instruction master's-level
 * programmes (totaltAntalTraffar), 50 per page, paged with sida + antalVisade.
 */

const SEARCH_URL = "https://www.universityadmissions.se/intl/search";
const SOK_URL = "https://www.universityadmissions.se/intl/api/sok";
const PAGE_SIZE = 50;

interface SokItem {
  titel?: string;
  status?: string;
  startdatum?: string;
  slutdatum?: string;
  anmalningsalternativ?: {
    anmalningsalternativKod?: string;
    titel?: string;
    poang?: string;
    organisation?: string;
    kursbeskrivningUrl?: string;
    studieort?: string;
    utbildningsniva?: string;
    studieavgiftTotal?: number;
    undervisningssprak?: string;
    program?: boolean;
    valdaAmnesNamn?: string[];
    antagningsomgangKod?: string;
  };
  educationEventId?: string;
}

interface SokResponse {
  sokresultatItems: SokItem[];
  totaltAntalTraffar?: number;
}

const alts = (item: SokItem): NonNullable<SokItem["anmalningsalternativ"]>[] =>
  (Array.isArray(item.anmalningsalternativ)
    ? item.anmalningsalternativ
    : item.anmalningsalternativ
      ? [item.anmalningsalternativ]
      : []) as NonNullable<SokItem["anmalningsalternativ"]>[];

function levelOf(niva?: string): "bachelor" | "master" | null {
  if (niva === "adv") return "master";
  if (niva === "grund") return "bachelor";
  return null;
}

export function mapSokItem(raw: SokItem, today: string): Programme | null {
  const alternatives = alts(raw);
  // Keep records where at least one alternative is English-taught.
  const alt = alternatives.find((a) => a.undervisningssprak === "English");
  const level = levelOf(alternatives[0]?.utbildningsniva ?? alt?.utbildningsniva);
  const name = (alt?.titel ?? raw.titel ?? "").trim();
  if (!level || !name || !alt) return null;

  const credits = Number(alt.poang ?? 0);
  const durationMonths = credits > 0 ? Math.round(credits / 5) : undefined;
  const noteParts = [
    credits ? `${credits} hp` : "",
    alt.antagningsomgangKod ? `admission round ${alt.antagningsomgangKod}` : "",
    (alt.valdaAmnesNamn ?? []).length
      ? `subjects: ${(alt.valdaAmnesNamn ?? []).slice(0, 4).join(", ")}`
      : "",
    raw.startdatum && raw.slutdatum
      ? `application window ${raw.startdatum} to ${raw.slutdatum}`
      : "",
  ].filter(Boolean);
  const notes = noteParts.join("; ");

  const recordId = `se-${(raw.educationEventId ?? alt.anmalningsalternativKod ?? name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`.slice(0, 90);

  const draft = {
    id: recordId,
    institution: alt.organisation?.trim() || "Swedish higher education institution",
    institutionType: "research-university",
    name,
    level,
    field: "General",
    language: alt.undervisningssprak || "English",
    city: alt.studieort?.trim() || "Sweden",
    ...(durationMonths ? { durationMonths } : {}),
    ...(alt.studieavgiftTotal ? { tuitionNonEu: alt.studieavgiftTotal } : {}),
    currency: "SEK",
    ...(raw.slutdatum ? { applicationDeadline: raw.slutdatum } : {}),
    applicationUrl: alt.kursbeskrivningUrl?.trim() || SEARCH_URL,
    ...(notes.length >= 10 ? { notes } : {}),
    provenance: {
      source: "University Admissions in Sweden (UHR) course search",
      sourceUrl: alt.kursbeskrivningUrl?.trim() || SEARCH_URL,
      retrieved: today,
    },
  };

  const result = programmeSchema.safeParse(draft);
  if (!result.success) return null;
  return result.data;
}

export interface SeRunResult {
  programmes: Programme[];
  skipped: { id: string; reason: string }[];
  total: number;
}

async function sweepLevel(
  post: (body: unknown) => Promise<SokResponse>,
  nivaKey: "avanceradNiva" | "grundNiva",
  cc: string,
  today: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<{ programmes: Programme[]; skipped: { id: string; reason: string }[]; total: number }> {
  const programmes = new Map<string, Programme>();
  const skipped: { id: string; reason: string }[] = [];
  let total = Number.POSITIVE_INFINITY;
  let sida = 1;
  const seen = new Set<string>();

  while ((sida - 1) * PAGE_SIZE < total && sida <= 60) {
    const body = {
      sortering: "nameAsc",
      sokfilter: { program: true, [nivaKey]: true },
      sida,
      antalVisade: (sida - 1) * PAGE_SIZE,
    };
    const data = await post(body);
    total = data.totaltAntalTraffar ?? total;
    const batch = data.sokresultatItems ?? [];
    if (batch.length === 0) break;
    let newKeys = 0;
    for (const item of batch) {
      const key = item.educationEventId ?? item.anmalningsalternativ?.anmalningsalternativKod ?? item.titel ?? "";
      if (seen.has(key)) continue;
      seen.add(key);
      newKeys += 1;
      const mapped = mapSokItem(item, today);
      if (mapped) programmes.set(mapped.id, mapped);
      else skipped.push({ id: `se-${key.slice(0, 40)}`, reason: "not English-taught, unmappable level, or schema mismatch" });
    }
    onProgress?.(seen.size, total);
    // A page with nothing new means the API stopped advancing: stop instead
    // of looping over repeats.
    if (newKeys === 0) break;
    if (batch.length < PAGE_SIZE) break; // last page
    sida += 1;
  }
  return { programmes: [...programmes.values()], skipped, total };
}

export async function runSeFinderHarvest(
  cc: string,
  today: string,
  onProgress?: (fetched: number, total: number) => void,
  maxRecords?: number,
): Promise<SeRunResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(SEARCH_URL, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(7000); // session cookies

  const post = async (body: unknown): Promise<SokResponse> => {
    const res = await page.request.post(SOK_URL, { data: body });
    const text = await res.text();
    return JSON.parse(text.replace(/^\)\]\}',?\s*/, "")) as SokResponse;
  };

  try {
    const master = await sweepLevel(post, "avanceradNiva", cc, today, onProgress);
    const bachelor = await sweepLevel(post, "grundNiva", cc, today, onProgress);
    const programmes = [...master.programmes, ...bachelor.programmes].slice(
      0,
      maxRecords ?? Number.POSITIVE_INFINITY,
    );
    const skipped = [...master.skipped, ...bachelor.skipped];
    return { programmes, skipped, total: master.total + bachelor.total };
  } finally {
    await browser.close();
  }
}
