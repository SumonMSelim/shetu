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
 * Fields available per record: title, institution, degree type
 * ("Master (2 years)" -> master, 2-year duration), subject area, ECTS
 * credits, and the detail page URL. The LISTING payload has no fees, but
 * each programme's content API item does: tuition_per_term__non_eu_eaa_ch
 * (the portal renders it as "N EUR"), plus the campus folder as parent.
 * A second pass per programme fetches that item and maps:
 *   - tuitionNonEu: ANNUAL fee = 2 x per-term (a Danish academic year is
 *     two terms), with the portal's per-term figure kept verbatim in notes;
 *   - city: from the campus folder title ("Campus Horsens" -> "Horsens");
 *   - currency: EUR on enriched records (the portal quotes EUR, not DKK).
 *
 * Verified live on 23 November 2026: 465 English-taught programmes;
 * fee fields verified across SDU/CBS/UCPH/AAU/AU/VIA on 28 November 2026.
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

/** Per-programme content API item (the detail pass). */
interface PloneDetail {
  tuition_per_term__non_eu_eaa_ch?: string | null;
  parent?: { title?: string } | null;
}

/** Sane per-term non-EU tuition band in EUR. Outside it the value is a
    source-data error: drop it rather than serve a figure a student would
    act on. (Observed live: EUR 3,500-16,300 per term.) */
const FEE_PER_TERM_MIN = 500;
const FEE_PER_TERM_MAX = 30000;

/** City from the campus folder title: "Campus Horsens" -> "Horsens",
    "Frederiksberg Campus" -> "Frederiksberg". Generic campus words (North,
    City, ...) are kept whole: bare "North" is useless as a location. */
const GENERIC_CAMPUS = /^(north|south|east|west|city|central|main)$/i;
function cityFromCampus(campus?: string | null): string | undefined {
  const t = campus?.trim();
  if (!t) return undefined;
  const stripped = t.replace(/^campus\s+/i, "").replace(/\s+campus$/i, "").trim();
  if (!stripped || GENERIC_CAMPUS.test(stripped)) return t;
  return stripped;
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

export function mapDkItem(raw: PloneItem, today: string, detail?: PloneDetail | null): Programme | null {
  const name = raw.title?.trim();
  const institution = raw.institution_title?.trim() || raw.institution?.trim();
  const degree = raw.degree_title?.trim() || raw.degree?.trim();
  const { level, durationMonths } = levelFromDegree(degree);
  if (!level || !name || !institution) return null;

  const subject = raw.program_subject_title?.[0]?.trim();

  // Fees: the detail item states a per-term figure the portal renders in
  // EUR. Store the annual amount (2 terms) so records compare with the
  // other countries' annual figures, and keep the portal's exact wording
  // in the notes. Values outside the plausibility band are dropped, and a
  // missing or zero figure means "not stated", never "free".
  let tuitionNonEu: number | undefined;
  let currency = "DKK";
  const perTerm = detail ? Number(detail.tuition_per_term__non_eu_eaa_ch) : NaN;
  if (Number.isFinite(perTerm) && perTerm >= FEE_PER_TERM_MIN && perTerm <= FEE_PER_TERM_MAX) {
    tuitionNonEu = perTerm * 2;
    currency = "EUR";
  }

  const noteParts = [
    degree ? `degree: ${degree}` : "",
    subject ? `subject: ${subject}` : "",
    tuitionNonEu !== undefined
      ? `non-EU tuition EUR ${tuitionNonEu.toLocaleString("en-GB")}/year (portal states EUR ${perTerm.toLocaleString("en-GB")} per term)`
      : "",
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
    city: cityFromCampus(detail?.parent?.title) || raw.city?.trim() || institution,
    ...(durationMonths ? { durationMonths } : {}),
    ...(tuitionNonEu !== undefined ? { tuitionNonEu } : {}),
    currency,
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

  // Detail pass: the listing payload has no fees; each programme's content
  // API item has them. Failures degrade gracefully to a record without fees.
  const getDetail = async (atId: string): Promise<PloneDetail | null> => {
    try {
      const path = new URL(atId).pathname
        .split("/")
        .filter((s) => s && s.toLowerCase() !== "portal")
        .join("/");
      const res = await page.request.get(`https://studyindenmark.dk/++api++/portal/${path}`);
      if (!res.ok) return null;
      return (await res.json()) as PloneDetail;
    } catch {
      return null;
    }
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
      const detail = item["@id"] ? await getDetail(item["@id"]) : null;
      if (detail) await new Promise((r) => setTimeout(r, 150)); // polite pacing
      const mapped = mapDkItem(item, today, detail);
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
