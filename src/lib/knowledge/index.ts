import type { KnowledgeBase } from "./types";
import { netherlands } from "./netherlands";

/**
 * Registry of destination knowledge bases.
 *
 * The product is destination-agnostic: the demo ships the Netherlands only, but
 * adding a country is as simple as writing another data module and registering
 * it here. Nothing in the agents or UI hard-codes a country.
 */
const REGISTRY: Record<string, KnowledgeBase> = {
  NL: netherlands,
};

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
