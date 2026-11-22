import { countryDataSchema } from "./schema";
import type { KnowledgeBase } from "./types";
import countryJson from "../../../data/countries/nl/country.json";
import scholarshipsJson from "../../../data/countries/nl/scholarships.json";
import costsJson from "../../../data/countries/nl/costs.json";
import institutionsJson from "../../../data/countries/nl/institutions.json";
import applicationsJson from "../../../data/countries/nl/applications.json";
import visaJson from "../../../data/countries/nl/visa.json";
import redFlagsJson from "../../../data/countries/nl/red-flags.json";
import programmesJson from "../../../data/countries/nl/programmes.json";

/**
 * Registry of destination knowledge bases.
 *
 * Content lives in data files (data/countries/<CC>/*.json), validated against
 * the zod schema in schema.ts at import time: a bad record fails loudly at
 * boot and in CI instead of silently serving an unverified figure. Adding a
 * country is a data operation: create the files under data/countries/<CC>/ and
 * register them here. Nothing in the agents or UI hard-codes a country.
 */

const NL = countryDataSchema.parse({
  meta: countryJson,
  scholarships: scholarshipsJson,
  costs: costsJson,
  institutions: institutionsJson,
  applications: applicationsJson,
  visa: visaJson,
  redFlags: redFlagsJson,
  programmes: programmesJson,
});

const REGISTRY: Record<string, KnowledgeBase> = {
  NL: toKnowledgeBase(NL),
};

function toKnowledgeBase(data: typeof NL): KnowledgeBase {
  const { meta, ...collections } = data;
  return { country: meta.country, countryName: meta.countryName, currency: meta.currency, ...collections };
}

/** The default destination used when the student has not chosen one yet. */
export const DEFAULT_COUNTRY = "NL";

export function getKnowledgeBase(country: string = DEFAULT_COUNTRY): KnowledgeBase {
  const kb = REGISTRY[country.toUpperCase()];
  if (!kb) {
    throw new Error(
      `No knowledge base for country "${country}". Available: ${Object.keys(REGISTRY).join(", ")}`,
    );
  }
  return kb;
}

export function availableCountries(): { code: string; name: string }[] {
  return Object.values(REGISTRY).map((kb) => ({
    code: kb.country,
    name: kb.countryName,
  }));
}

export type { KnowledgeBase } from "./types";
