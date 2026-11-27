import { programmeSchema } from "../schema";
import type { Programme } from "../types";

/**
 * Deterministic adapter for Ireland: the CAO (Central Applications Office)
 * course search at cao.ie, the official national database of undergraduate
 * courses, run jointly by the Irish universities. No JS widget, no WAF wall:
 * the search is a plain server-rendered HTML form.
 *   POST https://www.cao.ie/courses.php?bb=courses
 *   body: flag=hei&college=<two-letter code>&url=<institution label>
 * The response lists every course of that institution as server-rendered
 * cards:
 *   <li class='course-card'><div class='course-header'>
 *     <a href="<university course page>" class='course-link'>
 *       <span class='course-code'>AU300</span></a>
 *     <span class='course-title'>Business - Accounting &middot; Letterkenny</span>
 *   </div></li>
 * One plain fetch per institution (29 sweeps, ~10s). No LLM, no browser.
 *
 * The CAO listing states: course code, title (with campus after a middle
 * dot), and the university's own course page URL. It states NO level and
 * NO fees, so:
 *   - level comes from degree words in the title/URL slug, or from the
 *     CAO_L8_ONLY rule below; courses with no honest level signal are
 *     skipped (same honest-subset rule as FI/FR);
 *   - fees are simply absent until a per-university enrichment exists
 *     (like BE/FR).
 *
 * Level rule: "higher certificate" is CAO level 6 and NOT a bachelor, so
 * those are skipped. Everything else with an explicit honours/bachelor
 * word maps to bachelor. Traditional Irish universities award ONLY
 * honours bachelors (level 8) through the CAO, so their courses are
 * bachelor by institution type even when the title omits the degree word.
 *
 * Identity is the CAO course code: unique nationally, stable across years.
 *
 * Verified live on 28 November 2026: 1,494 total CAO courses across 29
 * institutions (sweep counts TR 145, DN 40, AU 217, TU 149).
 */

const CAO_SEARCH_URL = "https://www.cao.ie/courses.php?bb=courses";
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";

/** Traditional universities: CAO level 8 honours bachelors only. */
const CAO_L8_ONLY = new Set(["TR", "DN", "CK", "GY", "LM", "MH", "DC", "MI", "MU", "RC", "AD", "CM"]);

function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/** Institution list from the page's own select: "AC - American College". */
export function parseInstitutions(html: string): { code: string; name: string }[] {
  const sel = html.match(/<select name="url"[\s\S]*?<\/select>/i)?.[0] ?? "";
  const out: { code: string; name: string }[] = [];
  for (const opt of sel.match(/<option[^>]*>([^<]+)<\/option>/g) ?? []) {
    const label = decodeEntities(opt.replace(/<option[^>]*>/, "").replace(/<\/option>/, ""));
    const m = /^([A-Z]{2})\s*-\s*(.+)$/.exec(label);
    if (m) out.push({ code: m[1], name: m[2].trim() });
  }
  return out;
}

interface CourseCard {
  code: string;
  title: string;
  url: string;
}

export function parseCourseCards(html: string): CourseCard[] {
  const cards: CourseCard[] = [];
  const seen = new Set<string>();
  const blocks = html.match(/<li class='course-card'>[\s\S]*?<\/li>/g) ?? [];
  for (const block of blocks) {
    const link = /<a\s+href="([^"]+)"[^>]*class='course-link'>[\s\S]*?<span class='course-code'>([^<]+)<\/span>/.exec(block);
    const title = /<span class='course-title'>([\s\S]*?)<\/span>/.exec(block);
    if (!link || !title) continue;
    const code = decodeEntities(link[2]).replace(/\s+/g, "");
    if (!/^[A-Z]{2}[0-9]{3}$/.test(code) || seen.has(code)) continue;
    seen.add(code);
    cards.push({ code, title: decodeEntities(title[1]), url: link[1] });
  }
  return cards;
}

/** (level, honoursFlag) from the honest signals on the card, else null. */
export function levelFromCard(card: CourseCard, institutionCode: string): { level: Programme["level"]; honours: boolean } | null {
  const blob = `${card.title} ${card.url}`.toLowerCase();
  if (/higher certificate/.test(blob)) return null;
  if (/honours|hons\b|\(hons\)/.test(blob)) return { level: "bachelor", honours: true };
  if (/bachelor|b\.?sc\b|b\.?a\b/.test(blob)) return { level: "bachelor", honours: false };
  if (CAO_L8_ONLY.has(institutionCode)) return { level: "bachelor", honours: true };
  return null;
}

export function mapIeCard(card: CourseCard, institution: { code: string; name: string }, today: string): Programme | null {
  const level = levelFromCard(card, institution.code);
  if (!level) return null;

  // Title shape: "Subject - Title · Campus" -> name + city. The schema
  // requires a city string (like DK/FI), so cards without a campus fall
  // back to the institution name.
  const dotIdx = card.title.indexOf("·");
  const name = (dotIdx >= 0 ? card.title.slice(0, dotIdx) : card.title).trim();
  const city = (dotIdx >= 0 ? card.title.slice(dotIdx + 1).trim() : "") || institution.name;
  if (!name) return null;

  // Duration when the title states one ("3 years or 4 years"): the longest
  // stated span is the full award (honours exit).
  const years = [...card.title.matchAll(/(\d+)\s*year/g)].map((m) => Number(m[1]));
  const durationMonths = years.length > 0 ? Math.max(...years) * 12 : undefined;

  const notes = `CAO code ${card.code}; ${level.honours ? "level 8 honours bachelor" : "bachelor"}`;

  const draft = {
    id: `ie-${card.code.toLowerCase()}`,
    institution: institution.name,
    institutionType: CAO_L8_ONLY.has(institution.code) ? "research-university" : "university-college",
    name,
    level: level.level,
    field: "General",
    language: "English",
    city,
    ...(durationMonths ? { durationMonths } : {}),
    currency: "EUR",
    applicationUrl: card.url,
    notes,
    provenance: {
      source: "CAO course search (Central Applications Office)",
      sourceUrl: CAO_SEARCH_URL,
      retrieved: today,
    },
  };

  const result = programmeSchema.safeParse(draft);
  if (!result.success) return null;
  return result.data;
}

export interface IeRunResult {
  programmes: Programme[];
  skipped: { id: string; reason: string }[];
  total: number;
}

export async function runIeFinderHarvest(
  cc: string,
  today: string,
  onProgress?: (fetched: number, total: number) => void,
  maxRecords?: number,
): Promise<IeRunResult> {
  const get = async (init?: RequestInit): Promise<string> => {
    const res = await fetch(CAO_SEARCH_URL, {
      headers: { "User-Agent": UA },
      ...init,
    });
    if (!res.ok) throw new Error(`cao.ie HTTP ${res.status}`);
    return res.text();
  };

  const home = await get();
  const institutions = parseInstitutions(home);
  if (institutions.length === 0) throw new Error("cao.ie institution list not parseable");

  const raw: (CourseCard & { inst: { code: string; name: string } })[] = [];
  let seenCodes = 0;
  for (const inst of institutions) {
    const html = await get({
      method: "POST",
      headers: { "User-Agent": UA, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ flag: "hei", college: inst.code, url: `${inst.code} - ${inst.name}` }),
    });
    const cards = parseCourseCards(html);
    for (const c of cards) raw.push({ ...c, inst });
    seenCodes += cards.length;
    onProgress?.(seenCodes, institutions.length);
    await new Promise((r) => setTimeout(r, 250));
  }

  const programmes: Programme[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const seenIds = new Set<string>();
  for (const card of raw.slice(0, maxRecords ?? raw.length)) {
    const mapped = mapIeCard(card, card.inst, today);
    if (mapped && !seenIds.has(mapped.id)) {
      seenIds.add(mapped.id);
      programmes.push(mapped);
    } else if (!mapped) {
      skipped.push({
        id: `ie-${card.code.toLowerCase()}`,
        reason: "no honest level signal (higher certificate or unknown) on the CAO card",
      });
    }
  }
  return { programmes, skipped, total: raw.length };
}
