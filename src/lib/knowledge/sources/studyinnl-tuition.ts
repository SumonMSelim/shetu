import type { CostFigureUpdate } from "../schema";

/**
 * Deterministic extractor for the official Study in NL fees page
 * (https://www.studyinnl.org/finances/tuition-fees). No LLM: regexes over the
 * page text, encoding exactly what the page states. If the page's wording
 * changes and a pattern stops matching, the harvester reports an extraction
 * failure rather than guessing, and the freshness budget eventually flags the
 * stale record.
 */

export const studyinnlTuitionAdapter = {
  id: "studyinnl-tuition",

  extract(pageText: string): { figures: CostFigureUpdate[]; warnings: string[] } {
    const warnings: string[] = [];
    const figures: CostFigureUpdate[] = [];

    // "€ 2,694 for the academic year 2026-2027"
    const statutory = pageText.match(
      /€\s*([\d.,]+)\s+for the academic year (\d{4}-\d{4})/i,
    );
    if (statutory) {
      figures.push({
        costId: "tuition-statutory",
        amount: toNumber(statutory[1]),
        period: statutory[2],
      });
    } else {
      warnings.push("statutory fee pattern not found; wording may have changed");
    }

    // "...bachelor's programmes average between € 9,000 and € 20,000..."
    const bachelor = pageText.match(
      /bachelor'?s?\s+programmes?\s+(?:average\s+)?between\s+€\s*([\d.,]+)\s+and\s+€\s*([\d.,]+)/i,
    );
    // "...master's programmes run between € 12,000 and € 30,000..."
    const master = pageText.match(
      /master'?s?\s+programmes?\s+(?:run\s+|average\s+)?between\s+€\s*([\d.,]+)\s+and\s+€\s*([\d.,]+)/i,
    );
    if (bachelor && master) {
      figures.push({
        costId: "tuition-institutional",
        rangeLow: toNumber(bachelor[1]),
        rangeHigh: toNumber(master[2]),
      });
    } else {
      warnings.push("institutional fee range pattern not found; wording may have changed");
    }

    // "...handling fee of roughly € 75–100..."
    const handling = pageText.match(/handling fee[^.]{0,40}?€\s*([\d.,]+)\s*[–-]\s*€?\s*([\d.,]+)/i);
    if (handling) {
      figures.push({
        costId: "application-handling-fee",
        rangeLow: toNumber(handling[1]),
        rangeHigh: toNumber(handling[2]),
      });
    }

    return { figures, warnings };
  },
};

function toNumber(raw: string): number {
  // Fees on the page are whole euros; separators are thousands markers
  // (Dutch "2.694" or anglicised "2,694").
  return Number(raw.replace(/[.,\s]/g, ""));
}

export type SourceAdapter = {
  id: string;
  extract: (pageText: string) => { figures: CostFigureUpdate[]; warnings: string[] };
};

/** Adapter registry; the harvester looks sources up here by id. */
export const adapters: Record<string, SourceAdapter> = {
  "studyinnl-tuition": studyinnlTuitionAdapter,
};

export function getAdapter(id: string): SourceAdapter | undefined {
  return adapters[id];
}
