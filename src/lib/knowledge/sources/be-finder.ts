import { programmeSchema } from "../schema";
import type { Programme } from "../types";

/**
 * Deterministic adapter for Belgium (Flanders): the Study in Flanders
 * programme listing (https://www.studyinflanders.be/programmes),
 * server-rendered from the Flemish government's education database.
 * No LLM, no browser: plain fetches.
 *
 * The listing is paginated (/programmes/p2, p3, ... 20 cards per page, later
 * pages 5). Each card has: programme title (linked to the university's own
 * page), Type (PBA = professional bachelor, MAN = master, MAC = advanced
 * master), Institution, ECTS, Language. No tuition fees or city are
 * published on the cards, so none are mapped.
 *
 * Verified live on 23 November 2026: ~595 programmes across 39 pages.
 */

const LIST_BASE = "https://www.studyinflanders.be/programmes";
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";

interface BeCard {
  url: string;
  name: string;
  type: string;
  institution: string;
  ects?: number;
  language: string;
}

export function parseBeListing(html: string): BeCard[] {
  const titles = [...html.matchAll(
    /<h2><a class="link--extended" href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>/g,
  )].map((m) => ({ href: m[1] ?? "", name: strip(m[2] ?? "") }));
  const types = [...html.matchAll(
    /Type<\/span>\s*<span class="programme__info-value">([^<]+)<\/span>/g,
  )].map((m) => strip(m[1]));
  const institutions = [...html.matchAll(
    /Institution<\/span>\s*<span class="programme__info-value">\s*([^<]+?)\s*<\/span>/g,
  )].map((m) => strip(m[1]));
  const ectsList = [...html.matchAll(
    /ECTS<\/span>\s*<span class="programme__info-value">([^<]+)<\/span>/g,
  )].map((m) => strip(m[1]));
  const languages = [...html.matchAll(
    /Language<\/span>\s*<span class="programme__info-value">([^<]+)<\/span>/g,
  )].map((m) => strip(m[1]));

  const cards: BeCard[] = [];
  for (let i = 0; i < titles.length; i++) {
    const ectsMatch = /(\d+)\s*ECTS/i.exec(ectsList[i] ?? "");
    cards.push({
      url: titles[i]?.href ?? "",
      name: titles[i]?.name ?? "",
      type: types[i] ?? "",
      institution: institutions[i] ?? "",
      ...(ectsMatch ? { ects: Number(ectsMatch[1]) } : {}),
      language: languages[i] ?? "English",
    });
  }
  return cards;
}

function strip(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const TYPE_LEVEL: Record<string, Programme["level"]> = {
  PBA: "bachelor", // professional bachelor
  MAN: "master",
  MAC: "master", // advanced master
  MA: "master",
  MSC: "master",
};

export function mapBeCard(card: BeCard, today: string): Programme | null {
  const level = TYPE_LEVEL[card.type];
  if (!level) return null;
  const ects = card.ects ?? 0;
  const durationMonths = ects > 0 ? Math.round(ects / 5) : undefined;

  const noteParts = [
    ects ? `${ects} ECTS` : "",
    card.type ? `type: ${card.type}` : "",
  ].filter(Boolean);

  const draft = {
    id: `be-${slug(card.url.replace(/^https?:\/\/www\.studyinflanders\.be\/?/, "")) || slug(card.name)}`,
    institution: card.institution || "Flemish higher education institution",
    institutionType: /universit/i.test(card.institution)
      ? "research-university"
      : "university-college",
    name: card.name,
    level,
    field: "General",
    language: card.language || "English",
    city: "Flanders",
    ...(durationMonths ? { durationMonths } : {}),
    currency: "EUR",
    applicationUrl: card.url.startsWith("http") ? card.url : `${LIST_BASE}${card.url}`,
    ...(noteParts.length >= 10 ? { notes: noteParts.join("; ") } : {}),
    provenance: {
      source: "Study in Flanders (Flemish government) programme listing",
      sourceUrl: card.url.startsWith("http") ? card.url : `${LIST_BASE}${card.url}`,
      retrieved: today,
    },
  };

  const result = programmeSchema.safeParse(draft);
  if (!result.success) return null;
  return result.data;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/https?:\/\/www\.studyinflanders\.be\/?/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export interface BeRunResult {
  programmes: Programme[];
  skipped: { id: string; reason: string }[];
  total: number;
}

export async function runBeFinderHarvest(
  cc: string,
  today: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<BeRunResult> {
  const programmes: Programme[] = [];
  const skipped: { id: string; reason: string }[] = [];
  let fetched = 0;

  for (let n = 1; n <= 60; n++) {
    const url = n === 1 ? LIST_BASE : `${LIST_BASE}/p${n}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) break;
    const html = await res.text();
    const cards = parseBeListing(html);
    if (cards.length === 0) break;
    fetched += cards.length;
    for (const card of cards) {
      const mapped = mapBeCard(card, today);
      if (mapped) programmes.push(mapped);
      else skipped.push({ id: `be-${slug(card.name).slice(0, 40)}`, reason: `type ${card.type} not mappable to a level` });
    }
    onProgress?.(fetched, fetched);
    await new Promise((r) => setTimeout(r, 300));
  }
  return { programmes, skipped, total: fetched };
}
