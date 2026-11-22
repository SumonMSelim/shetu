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
import fiCountryJson from "../../../data/countries/fi/country.json";
import fiScholarshipsJson from "../../../data/countries/fi/scholarships.json";
import fiCostsJson from "../../../data/countries/fi/costs.json";
import fiInstitutionsJson from "../../../data/countries/fi/institutions.json";
import fiApplicationsJson from "../../../data/countries/fi/applications.json";
import fiVisaJson from "../../../data/countries/fi/visa.json";
import fiRedFlagsJson from "../../../data/countries/fi/red-flags.json";
import fiProgrammesJson from "../../../data/countries/fi/programmes.json";
import eeCountryJson from "../../../data/countries/ee/country.json";
import eeScholarshipsJson from "../../../data/countries/ee/scholarships.json";
import eeCostsJson from "../../../data/countries/ee/costs.json";
import eeInstitutionsJson from "../../../data/countries/ee/institutions.json";
import eeApplicationsJson from "../../../data/countries/ee/applications.json";
import eeVisaJson from "../../../data/countries/ee/visa.json";
import eeRedFlagsJson from "../../../data/countries/ee/red-flags.json";
import eeProgrammesJson from "../../../data/countries/ee/programmes.json";
import noCountryJson from "../../../data/countries/no/country.json";
import noScholarshipsJson from "../../../data/countries/no/scholarships.json";
import noCostsJson from "../../../data/countries/no/costs.json";
import noInstitutionsJson from "../../../data/countries/no/institutions.json";
import noApplicationsJson from "../../../data/countries/no/applications.json";
import noVisaJson from "../../../data/countries/no/visa.json";
import noRedFlagsJson from "../../../data/countries/no/red-flags.json";
import noProgrammesJson from "../../../data/countries/no/programmes.json";
import seCountryJson from "../../../data/countries/se/country.json";
import seScholarshipsJson from "../../../data/countries/se/scholarships.json";
import seCostsJson from "../../../data/countries/se/costs.json";
import seInstitutionsJson from "../../../data/countries/se/institutions.json";
import seApplicationsJson from "../../../data/countries/se/applications.json";
import seVisaJson from "../../../data/countries/se/visa.json";
import seRedFlagsJson from "../../../data/countries/se/red-flags.json";
import seProgrammesJson from "../../../data/countries/se/programmes.json";
import deCountryJson from "../../../data/countries/de/country.json";
import deScholarshipsJson from "../../../data/countries/de/scholarships.json";
import deCostsJson from "../../../data/countries/de/costs.json";
import deInstitutionsJson from "../../../data/countries/de/institutions.json";
import deApplicationsJson from "../../../data/countries/de/applications.json";
import deVisaJson from "../../../data/countries/de/visa.json";
import deRedFlagsJson from "../../../data/countries/de/red-flags.json";
import deProgrammesJson from "../../../data/countries/de/programmes.json";

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

const DE = countryDataSchema.parse({
  meta: deCountryJson,
  scholarships: deScholarshipsJson,
  costs: deCostsJson,
  institutions: deInstitutionsJson,
  applications: deApplicationsJson,
  visa: deVisaJson,
  redFlags: deRedFlagsJson,
  programmes: deProgrammesJson,
});

const FI = countryDataSchema.parse({
  meta: fiCountryJson,
  scholarships: fiScholarshipsJson,
  costs: fiCostsJson,
  institutions: fiInstitutionsJson,
  applications: fiApplicationsJson,
  visa: fiVisaJson,
  redFlags: fiRedFlagsJson,
  programmes: fiProgrammesJson,
});

const SE = countryDataSchema.parse({
  meta: seCountryJson,
  scholarships: seScholarshipsJson,
  costs: seCostsJson,
  institutions: seInstitutionsJson,
  applications: seApplicationsJson,
  visa: seVisaJson,
  redFlags: seRedFlagsJson,
  programmes: seProgrammesJson,
});

const EE = countryDataSchema.parse({
  meta: eeCountryJson,
  scholarships: eeScholarshipsJson,
  costs: eeCostsJson,
  institutions: eeInstitutionsJson,
  applications: eeApplicationsJson,
  visa: eeVisaJson,
  redFlags: eeRedFlagsJson,
  programmes: eeProgrammesJson,
});

const NO = countryDataSchema.parse({
  meta: noCountryJson,
  scholarships: noScholarshipsJson,
  costs: noCostsJson,
  institutions: noInstitutionsJson,
  applications: noApplicationsJson,
  visa: noVisaJson,
  redFlags: noRedFlagsJson,
  programmes: noProgrammesJson,
});

const REGISTRY: Record<string, KnowledgeBase> = {
  NL: toKnowledgeBase(NL),
  DE: toKnowledgeBase(DE),
  FI: toKnowledgeBase(FI),
  SE: toKnowledgeBase(SE),
  EE: toKnowledgeBase(EE),
  NO: toKnowledgeBase(NO),
};

function toKnowledgeBase(data: typeof NL | typeof DE | typeof FI | typeof SE | typeof EE | typeof NO): KnowledgeBase {
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
