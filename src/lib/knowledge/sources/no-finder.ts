import { programmeSchema } from "../schema";
import type { Programme } from "../types";

/**
 * Deterministic adapter for Norway: the Study in Norway programme listing
 * (https://studyinnorway.no/study-opportunities), server-rendered Drupal
 * from the Norwegian Directorate for Higher Education and Skills. No LLM,
 * no browser: plain fetches.
 *
 * Listing pages (Drupal pager, ?page=N zero-indexed) contain card blocks
 * (class "search-item") laid out as: type | institution | programme name |
 * Duration | <duration> | Level | <level> | detail link. The detail page
 * adds campus/city, application deadlines, and sometimes a numeric tuition.
 *
 * Verified live on 23 November 2026.
 */

const LISTING_URL = "https://studyinnorway.no/study-opportunities";
const SITE = "https://studyinnorway.no";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";

const stripTags = (html: string): string =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30);
}

export interface ListingCard {
  kind: string;
  institution: string;
  name: string;
  durationMonths?: number;
  ects?: number;
  level: "bachelor" | "master" | "phd" | null;
  detailPath: string;
  /** The university's own programme page, when present. */
  applicationUrl?: string;
}

/** Parse the listing cards out of one listing page (Drupal pager included). */
export function parseListingCards(html: string): { cards: ListingCard[]; maxPage: number } {
  const blocks = html.split("<article ").slice(1).filter((b) => b.includes("search-item"));
  const cards: ListingCard[] = [];
  let maxPage = 0;
  for (const m of html.matchAll(/href="[^"]*\?page=(\d+)"/g)) {
    maxPage = Math.max(maxPage, Number(m[1]));
  }
  for (const block of blocks) {
    const typeM = /search-item__type"><span>([^<]*)<\/span>\s*([^<]*)/.exec(block);
    const titleM = /search-item__title">\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/.exec(block);
    if (!typeM || !titleM) continue;
    const kind = typeM[1].trim();
    const institution = typeM[2].trim();
    const detailPath = titleM[1];
    const name = stripTags(titleM[2]).trim();
    if (!name || !institution || !detailPath) continue;

    const listItems = [...block.matchAll(
      /search-item__list-label">\s*([^<]*?)\s*<\/div>\s*<div[^>]*>([\s\S]*?)<\/div>/g,
    )].map((m) => ({ label: stripTags(m[1]), value: stripTags(m[2]) }));
    const get = (label: string) =>
      listItems.find((i) => i.label.toLowerCase() === label.toLowerCase())?.value ?? "";

    const durText = get("Duration");
    const dur = /(\d+)\s*year/i.exec(durText);
    const sem = /(\d+)\s*semester/i.exec(durText);
    const ectsMatch = /(\d+)\s*(?:ECT|ECTS)/i.exec(durText);
    const durationMonths = dur
      ? Math.round(Number(dur[1]) * 12)
      : sem
        ? Number(sem[1]) * 6
        : undefined;
    const ects = ectsMatch ? Number(ectsMatch[1]) : undefined;
    const levelText = get("Level");
    const level = /bachelor/i.test(levelText)
      ? ("bachelor" as const)
      : /master/i.test(levelText)
        ? ("master" as const)
        : /phd|doctoral/i.test(levelText)
          ? ("phd" as const)
          : null;

    // The university's own programme page, when the logo link carries one.
    const uniPage = /title="Visit Programme"\s*>\s*<a href="(https?:\/\/[^"]+)"/.exec(block)?.[1];

    cards.push({
      kind,
      institution,
      name,
      ...(durationMonths ? { durationMonths } : {}),
      ...(ects ? { ects } : {}),
      level,
      detailPath,
      ...(uniPage ? { applicationUrl: uniPage } : {}),
    });
  }
  return { cards, maxPage };
}

function levelOf(niva?: string): "bachelor" | "master" | "phd" | null {
  if (!niva) return null;
  if (/master/i.test(niva)) return "master";
  if (/bachelor/i.test(niva)) return "bachelor";
  if (/phd|doctoral/i.test(niva)) return "phd";
  return null;
}

export function mapNoCard(
  card: ListingCard,
  detailHtml: string,
  today: string,
): Programme | null {
  if (!card.level) return null;
  const text = stripTags(detailHtml);

  // "Campus Pilestredet Campus, Oslo Application deadline ..."
  const campus = /Campus\s+([A-ZÆØÅ][^|]*?)(?:\s+Application deadline)/.exec(text)?.[1]?.trim();
  const city = (campus ?? "").split(",").map((s) => s.trim()).filter(Boolean).pop();
  const deadline =
    /Application deadline\s+([A-ZÆØÅ][^|]*?)(?:\s+Entry requirements|\s*$)/.exec(text)?.[1]?.trim();
  const nokFee = /(?:NOK|kr)\s*([\d\s.,]+)/i.exec(text)?.[1];
  const tuitionNonEu = nokFee
    ? Number(nokFee.replace(/[\s.,]/g, (m) => (m === "." ? "" : "")))
    : undefined;

  const draft = {
    id: `no-${slug(card.name)}-${slug(card.institution)}`.slice(0, 90),
    institution: card.institution,
    institutionType: /høgskole|university college/i.test(card.institution)
      ? "university-college"
      : "research-university",
    name: card.name,
    level: card.level,
    field: "General",
    language: "English",
    city: city || card.institution,
    ...(card.durationMonths ? { durationMonths: card.durationMonths } : {}),
    ...(tuitionNonEu && tuitionNonEu > 0 ? { tuitionNonEu } : {}),
    currency: "NOK",
    ...(deadline ? { applicationDeadline: deadline } : {}),
    applicationUrl: card.applicationUrl ?? `${SITE}${card.detailPath}`,
    // A bare ECTS note is under the schema's 10-char minimum: omit it.
    provenance: {
      source: "Study in Norway (Norwegian Directorate for Higher Education and Skills)",
      sourceUrl: card.applicationUrl ?? `${SITE}${card.detailPath}`,
      retrieved: today,
    },
  };

  const result = programmeSchema.safeParse(draft);
  if (!result.success) {
    // Source drift or a parsing gap: report the exact schema issues instead
    // of failing silently (the harvest lists these as skipped reasons).
    console.error(
      `no-finder schema issues for ${card.name}:`,
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
    );
    return null;
  }
  return result.data;
}

export interface NoRunResult {
  programmes: Programme[];
  skipped: { id: string; reason: string }[];
  total: number;
}

export async function runNoFinderHarvest(
  cc: string,
  today: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<NoRunResult> {
  const programmes: Programme[] = [];
  const skipped: { id: string; reason: string }[] = [];
  const detailTargets: { card: ListingCard; url: string }[] = [];
  const seenLinks = new Set<string>();
  let total = 0;

  for (let page = 0; page < 30; page++) {
    const res = await fetch(page === 0 ? LISTING_URL : `${LISTING_URL}?page=${page}`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) throw new Error(`Study in Norway HTTP ${res.status} on page ${page}`);
    const html = await res.text();
    const { cards, maxPage } = parseListingCards(html);
    for (const card of cards) {
      const link = card.detailPath.startsWith("http")
        ? card.detailPath
        : `${SITE}${card.detailPath}`;
      if (seenLinks.has(link)) continue;
      seenLinks.add(link);
      detailTargets.push({ card, url: link });
    }
    total = Math.max(total, seenLinks.size);
    onProgress?.(seenLinks.size, total);
    if (cards.length === 0 || page >= maxPage) break;
    await new Promise((r) => setTimeout(r, 300));
  }

  let done = 0;
  for (const { card, url } of detailTargets) {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    const html = res.ok ? await res.text() : "";
    const mapped = html ? mapNoCard(card, html, today) : null;
    if (mapped) programmes.push(mapped);
    else
      skipped.push({
        id: `no-${slug(card.name).slice(0, 30)}`,
        reason: "detail page unmappable (missing level or name)",
      });
    done += 1;
    if (done % 25 === 0) onProgress?.(done, detailTargets.length);
    await new Promise((r) => setTimeout(r, 250));
  }
  return { programmes, skipped, total: detailTargets.length };
}
