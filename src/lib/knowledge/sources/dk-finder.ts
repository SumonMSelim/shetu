import { chromium } from "playwright";
import { programmeSchema } from "../schema";
import type { Programme } from "../types";

/**
 * Deterministic adapter for Denmark: the studyindenmark.dk programme portal,
 * a Volto (Plone 6) app whose data comes from the Plone REST API:
 *   GET /++api++/portal/@querystring-search?query={...portal_type:"program"...}
 *
 * The site's WAF blocks non-browser fetches, so the adapter loads the portal
 * page once in a headless browser (which also passes the cookie-consent wall)
 * and then queries the API through that session. No LLM.
 *
 * Fields available per record: title, institution, city, degree type
 * ("Master (2 years)" -> master, 2-year duration), subject area, ECTS
 * credits, and the detail page URL. Tuition fees are not published per
 * programme on this portal.
 *
 * Verified live on 23 November 2026: 465 English-taught programmes.
 */

const PORTAL_URL = "https://studyindenmark.dk/portal";
const API_SEARCH = "https://studyindenmark.dk/++api++/portal/@querystring-search?query=";
const PAGE_SIZE = 50;

function queryFor(bStart: number): string {
  return JSON.stringify({
    metadata_fields: "_all",
    b_size: String(PAGE_SIZE),
    limit: "1000",
    query: [
      { i: "portal_type", o: "plone.app.querystring.operation.selection.any", v: ["program"] },
      { i: "path", o: "plone.app.querystring.operation.string.absolutePath", v: "/portal" },
    ],
    sort_on: "sortable_title",
    sort_order: "ascending",
    b_start: bStart,
  });
}

interface PloneItem {
  title?: string;
  description?: string;
  "@id"?: string;
  /** Field name for the institution slug; the display name is _title. */
  institution?: string;
  institution_title?: string;
  city?: string;
  location?: string | null;
  degree?: string;
  degree_title?: string;
  program_subject_title?: string[];
  credits?: number | null;
}

interface PloneResponse {
  items?: PloneItem[];
  items_total?: number;
}

function levelFromDegree(degree?: string): { level: Programme["level"] | null; durationMonths?: number } {
  if (!degree) return { level: null };
  const d = degree.toLowerCase();
  const yrs = /(\d+)\s*year/.exec(d);
  const durationMonths = yrs ? Number(yrs[1]) * 12 : undefined;
  if (/master|\bmsc\b/.test(d)) return { level: "master", ...(durationMonths ? { durationMonths } : {}) };
  if (/bachelor|\bbsc\b/.test(d)) return { level: "bachelor", ...(durationMonths ? { durationMonths } : {}) };
  if (/phd|doctoral/.test(d)) return { level: "phd", ...(durationMonths ? { durationMonths } : {}) };
  if (/academy profession|applied/.test(d)) return { level: "bachelor", ...(durationMonths ? { durationMonths } : {}) };
  return { level: null, ...(durationMonths ? { durationMonths } : {}) };
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Same slug without the 25-char cap: identity slugs must not collide. */
function slugFull(text: string): string {
  return text;
}

export function mapDkItem(raw: PloneItem, today: string): Programme | null {
  const name = raw.title?.trim();
  const institution = raw.institution_title?.trim() || raw.institution?.trim();
  const degree = raw.degree_title?.trim() || raw.degree?.trim();
  const { level, durationMonths } = levelFromDegree(degree);
  if (!level || !name || !institution) return null;

  const subject = raw.program_subject_title?.[0]?.trim();
  const noteParts = [
    degree ? `degree: ${degree}` : "",
    subject ? `subject: ${subject}` : "",
  ].filter(Boolean);
  const notes = noteParts.join("; ");

  // The identity is institution slug + the full URL path slug (minus the
  // leading "portal" segment). The full path is used untruncated: several
  // programmes share long prefixes and even the same name across campuses,
  // so any truncation risks colliding distinct records.
  const urlPath = raw["@id"] ? new URL(raw["@id"]).pathname : "";
  const pathSlug = slugFull(
    urlPath
      .split("/")
      .filter((s) => Boolean(s) && s.toLowerCase() !== "portal")
      .join("-"),
  );

  const draft = {
    id: `dk-${slug(institution)}-${pathSlug || slug(name)}`,
    institution,
    institutionType: /universit/i.test(institution)
      ? "research-university"
      : /business academy|erhvervsakademi/i.test(institution)
        ? "university-college"
        : "university-college",
    name,
    level,
    field: subject || "General",
    language: "English",
    city: raw.city?.trim() || institution,
    ...(durationMonths ? { durationMonths } : {}),
    currency: "DKK",
    applicationUrl: raw["@id"]?.trim() || PORTAL_URL,
    ...(notes.length >= 10 ? { notes } : {}),
    provenance: {
      source: "Study in Denmark programme portal (Danish Energy Agency / UddannelsesGuiden data)",
      sourceUrl: raw["@id"]?.trim() || PORTAL_URL,
      retrieved: today,
    },
  };

  const result = programmeSchema.safeParse(draft);
  if (!result.success) return null;
  return result.data;
}



export interface DkRunResult {
  programmes: Programme[];
  skipped: { id: string; reason: string }[];
  total: number;
}

export async function runDkFinderHarvest(
  cc: string,
  today: string,
  onProgress?: (fetched: number, total: number) => void,
  maxRecords?: number,
): Promise<DkRunResult> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(PORTAL_URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(5000);
  // Pass the cookie-consent wall (the app refuses to fetch data before it).
  await page
    .evaluate(() => {
      const b = [...document.querySelectorAll("button")].find((x) => /allow all|deny/i.test((x.textContent ?? "").trim()));
      if (b) b.click();
    })
    .catch(() => {});
  await page.waitForTimeout(15_000); // app fetches the first batch

  const post = async (bStart: number): Promise<PloneResponse> => {
    // b_start goes INSIDE the query JSON: as a URL parameter it is ignored
    // and every batch returns the same first page.
    const res = await page.request.get(`${API_SEARCH}${encodeURIComponent(queryFor(bStart))}`);
    if (!res.ok) throw new Error(`studyindenmark API HTTP ${res.status} at b_start ${bStart}`);
    return (await res.json()) as PloneResponse;
  };

  try {
    const raw: PloneItem[] = [];
    let total = 0;
    for (let bStart = 0; bStart < 1000; bStart += PAGE_SIZE) {
      const data = await post(bStart);
      total = data.items_total ?? total;
      const batch = data.items ?? [];
      if (batch.length === 0) break;
      raw.push(...batch);
      onProgress?.(raw.length, total);
      if (batch.length < PAGE_SIZE) break;
      await new Promise((r) => setTimeout(r, 400));
    }

    const programmes: Programme[] = [];
    const skipped: { id: string; reason: string }[] = [];
    for (const item of raw.slice(0, maxRecords ?? raw.length)) {
      const mapped = mapDkItem(item, today);
      if (mapped) programmes.push(mapped);
      else
        skipped.push({
          id: `dk-${slug(item.title ?? "untitled").slice(0, 30)}`,
          reason: "no degree level, name, or institution in the record",
        });
    }
    return { programmes, skipped, total };
  } finally {
    await browser.close();
  }
}
