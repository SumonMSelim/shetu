import { programmeSchema } from "./schema";
import type { Programme } from "./types";

/**
 * Drafting pipeline logic for Track D stage 2 (AI drafts, humans approve).
 *
 * The flow for one source page:
 *   1. fetch (or read a saved copy) and extract page text
 *   2. ask the fast model to extract ONLY page-stated facts into the Programme
 *      shape, returning JSON
 *   3. parseDraftJson: recover the JSON from the model's reply
 *   4. stampProvenance: attach today's date, the source URL, and an honest
 *      source label; drop anything the schema rejects
 *   5. mergeProgrammes: dedupe against what is already in the country file
 *      (by applicationUrl, then by id), report what would be added
 *
 * The human reviews the resulting diff, edits where needed, and opens the PR.
 * CI runs the full validator; nothing reaches the agents unvalidated.
 */

/** Recover a JSON array from a model reply, tolerating prose and fences. */
export function parseDraftJson(reply: string): unknown[] {
  const fenced = reply.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : reply;
  const start = candidate.indexOf("[");
  const end = candidate.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("model reply contained no JSON array");
  }
  return JSON.parse(candidate.slice(start, end + 1)) as unknown[];
}

/** Today as an ISO date (YYYY-MM-DD), the stamp every draft gets. */
export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Stamp and validate one draft record. Returns the valid Programme, or null
 * with a reason when the draft fails the schema (listed in `problems`).
 * Generates a deterministic slug id when the model did not provide one, so
 * re-running the same page dedupes cleanly. `statutoryFeeEu`, when provided,
 * fills tuitionEu for programmes where the page did not state a fee: it is
 * the national statutory fee and the note says so explicitly.
 */
export function stampAndValidate(
  draft: unknown,
  opts: {
    sourceUrl: string;
    sourceName: string;
    retrieved: string;
    countryCode: string;
    currency?: string;
    statutoryFeeEu?: number;
  },
  problems: string[],
): Programme | null {
  const raw = (typeof draft === "object" && draft !== null ? draft : {}) as Record<string, unknown>;

  if (typeof raw.id !== "string" || raw.id.trim().length < 3) {
    raw.id = slugId(
      opts.countryCode,
      String(raw.name ?? "programme"),
      String(raw.institution ?? ""),
    );
  }

  // Fields the pipeline knows better than the model: the programme page is the
  // page being processed, and the currency comes from the country meta.
  raw.applicationUrl = opts.sourceUrl;
  if (typeof raw.currency !== "string" && opts.currency) {
    raw.currency = opts.currency;
  }

  // Enrichment: national statutory fee, clearly labelled as such.
  if (opts.statutoryFeeEu !== undefined) {
    const hasOwnFee =
      typeof raw.tuitionNonEu === "number" ||
      raw.notes !== undefined;
    if (!hasOwnFee) {
      raw.tuitionEu = opts.statutoryFeeEu;
      raw.notes = `Statutory (EU/EEA) fee is the national fee per Study in NL; figures stated on the programme page take precedence. Exact non-EEA institutional fee and programme-specific deadlines: verify on the official programme page.`;
    }
  }

  const stamped = {
    ...raw,
    provenance: {
      source: `${opts.sourceName} (programme page, verified by reviewer)`,
      sourceUrl: opts.sourceUrl,
      retrieved: opts.retrieved,
    },
  };

  const result = programmeSchema.safeParse(stamped);
  if (!result.success) {
    for (const issue of result.error.issues) {
      problems.push(
        `${String(raw.name ?? "(unnamed draft)")} ${issue.path.join(".")}: ${issue.message}`,
      );
    }
    return null;
  }
  return result.data;
}

export interface MergeResult {
  added: Programme[];
  skippedDuplicates: { url: string; id: string }[];
}

/** Deterministic record id: `cc-slug(name)-slug(institution)`, capped at 80 chars. */
export function slugId(countryCode: string, name: string, institution: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30);
  return `${countryCode.toLowerCase()}-${slug(name)}-${slug(institution)}`.slice(0, 80);
}

/** Dedupe drafts against existing programmes by applicationUrl, then id. */
export function mergeProgrammes(existing: Programme[], drafts: Programme[]): MergeResult {
  const seenUrls = new Set(existing.map((p) => p.applicationUrl));
  const seenIds = new Set(existing.map((p) => p.id));
  const added: Programme[] = [];
  const skippedDuplicates: MergeResult["skippedDuplicates"] = [];
  for (const draft of drafts) {
    if (seenUrls.has(draft.applicationUrl) || seenIds.has(draft.id)) {
      skippedDuplicates.push({ url: draft.applicationUrl, id: draft.id });
      continue;
    }
    seenUrls.add(draft.applicationUrl);
    seenIds.add(draft.id);
    added.push(draft);
  }
  return { added, skippedDuplicates };
}

/** Strip markup down to readable text for the extraction model. */
export function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&euro;/g, "€")
    .replace(/&#8364;/g, "€")
    .replace(/\s+/g, " ")
    .trim();
}
