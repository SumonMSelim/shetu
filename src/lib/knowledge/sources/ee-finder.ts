import { programmeSchema } from "../schema";
import type { Programme } from "../types";

/**
 * Deterministic adapter for Estonia: the Study in Estonia programme tables
 * (https://studyinestonia.ee/study/programmes/<level>), server-rendered HTML
 * from the Education and Youth Board. No LLM, no browser: plain fetches.
 *
 * The listing is one table per page: header row, field-section rows (the
 * section name doubles as the programme's field), then one row per programme
 * with name, university, a tuition cell that mixes EU and non-EU figures,
 * a contact email, and the national application link (Dreamapply).
 *
 * Verified live on 22 November 2026 (masters page: 87 rows incl. header and
 * section rows).
 */

const LISTING_BASE = "https://studyinestonia.ee/study/programmes";

const LEVEL_PAGES: { level: "bachelor" | "master" | "phd"; path: string }[] = [
  { level: "master", path: "masters-programmes" },
  { level: "bachelor", path: "bachelors-programmes" },
  { level: "phd", path: "doctoral-programmes" },
];

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

/**
 * The tuition cell mixes EU and non-EU figures in varying formats:
 *   "EU, UK... 3300 Non-EU 3800", "4800 for non-EU/EEA/Swiss 0 for EU/EEA/Swiss".
 * In both observed formats the non-EU figure is the largest number (non-EU
 * tuition is at or above the EU figure, and "0" marks EU/EEA exemptions).
 */
function parseNonEuFee(cell: string): number | undefined {
  const numbers = (cell.match(/\d[\d\s]*\d|\d/g) ?? [])
    .map((n) => Number(n.replace(/\s/g, "")))
    .filter((n) => n > 0);
  if (numbers.length === 0) return undefined;
  return Math.max(...numbers);
}

export function parseEeListing(html: string, level: Programme["level"], today: string): Programme[] {
  const programmes: Programme[] = [];
  const tables = html.match(/<table[\s\S]*?<\/table>/g) ?? [];

  for (const table of tables) {
    const rows = table.match(/<tr[\s\S]*?<\/tr>/g) ?? [];
    let field = "General";
    let rowIndex = 0;
    for (const row of rows) {
      rowIndex += 1;
      const cells = (row.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g) ?? []).map((c) =>
        stripTags(c.replace(/^<t[dh][^>]*>/, "").replace(/<\/t[dh]$/, "")),
      );
      if (cells.length < 5) continue;
      const [nameCell, university, feeCell, contact, applyCell] = cells;

      // Section rows carry the field grouping and nothing else.
      if (!university && !feeCell && !contact) {
        field = nameCell || field;
        continue;
      }
      if (/^name of the programme/i.test(nameCell)) continue; // header row

      const name = nameCell.replace(/\s+/g, " ").trim();
      const institution = university.replace(/\s+/g, " ").trim();
      if (!name || !institution) continue;

      const applyHref = /href="([^"]+)"/.exec(applyCell)?.[1];
      const programmeHref = /href="([^"]+)"/.exec(row)?.[1];
      const contactEmail = /[\w.+-]+@[\w.-]+\.\w+/.exec(contact)?.[0];
      const tuitionNonEu = parseNonEuFee(feeCell);

      const noteParts = [
        contactEmail ? `contact: ${contactEmail}` : "",
        `field group: ${field}`,
      ].filter(Boolean);

      const id = `ee-${slug(name)}-${slug(institution)}-${level[0]}${rowIndex}`.slice(0, 90);
      const draft = {
        id,
        institution,
        institutionType: "university",
        name,
        level,
        field: field.replace(/\s+/g, " ").trim().toLowerCase(),
        language: "English",
        city: institution,
        ...(tuitionNonEu && tuitionNonEu > 0 ? { tuitionNonEu } : {}),
        currency: "EUR",
        ...(applyHref
          ? { applicationUrl: new URL(applyHref, "https://studyinestonia.ee").href }
          : programmeHref
            ? { applicationUrl: programmeHref }
            : { applicationUrl: `${LISTING_BASE}/${level}s` }),
        ...(noteParts.length >= 10 ? { notes: noteParts.join("; ") } : {}),
        provenance: {
          source: "Study in Estonia (Education and Youth Board) programme tables",
          sourceUrl: `${LISTING_BASE}`,
          retrieved: today,
        },
      };

      const result = programmeSchema.safeParse(draft);
      if (result.success) programmes.push(result.data);
    }
  }
  return programmes;
}

export interface EeRunResult {
  programmes: Programme[];
  total: number;
}

export async function runEeFinderHarvest(
  cc: string,
  today: string,
  onProgress?: (fetched: number, total: number) => void,
): Promise<EeRunResult> {
  const programmes: Programme[] = [];
  let total = 0;
  for (const { level, path } of LEVEL_PAGES) {
    const res = await fetch(`${LISTING_BASE}/${path}`, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error(`Study in Estonia HTTP ${res.status} for ${path}`);
    const html = await res.text();
    const parsed = parseEeListing(html, level, today);
    programmes.push(...parsed);
    total += parsed.length;
    onProgress?.(total, total);
    await new Promise((r) => setTimeout(r, 300));
  }
  return { programmes, total };
}
