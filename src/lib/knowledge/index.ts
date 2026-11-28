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
import frCountryJson from "../../../data/countries/fr/country.json";
import frScholarshipsJson from "../../../data/countries/fr/scholarships.json";
import frCostsJson from "../../../data/countries/fr/costs.json";
import frInstitutionsJson from "../../../data/countries/fr/institutions.json";
import frApplicationsJson from "../../../data/countries/fr/applications.json";
import frVisaJson from "../../../data/countries/fr/visa.json";
import frRedFlagsJson from "../../../data/countries/fr/red-flags.json";
import frProgrammesJson from "../../../data/countries/fr/programmes.json";
import beCountryJson from "../../../data/countries/be/country.json";
import beScholarshipsJson from "../../../data/countries/be/scholarships.json";
import beCostsJson from "../../../data/countries/be/costs.json";
import beInstitutionsJson from "../../../data/countries/be/institutions.json";
import beApplicationsJson from "../../../data/countries/be/applications.json";
import beVisaJson from "../../../data/countries/be/visa.json";
import beRedFlagsJson from "../../../data/countries/be/red-flags.json";
import beProgrammesJson from "../../../data/countries/be/programmes.json";
import dkCountryJson from "../../../data/countries/dk/country.json";
import dkScholarshipsJson from "../../../data/countries/dk/scholarships.json";
import dkCostsJson from "../../../data/countries/dk/costs.json";
import dkInstitutionsJson from "../../../data/countries/dk/institutions.json";
import dkApplicationsJson from "../../../data/countries/dk/applications.json";
import dkVisaJson from "../../../data/countries/dk/visa.json";
import dkRedFlagsJson from "../../../data/countries/dk/red-flags.json";
import dkProgrammesJson from "../../../data/countries/dk/programmes.json";
import ieCountryJson from "../../../data/countries/ie/country.json";
import ieScholarshipsJson from "../../../data/countries/ie/scholarships.json";
import ieCostsJson from "../../../data/countries/ie/costs.json";
import ieInstitutionsJson from "../../../data/countries/ie/institutions.json";
import ieApplicationsJson from "../../../data/countries/ie/applications.json";
import ieVisaJson from "../../../data/countries/ie/visa.json";
import ieRedFlagsJson from "../../../data/countries/ie/red-flags.json";
import ieProgrammesJson from "../../../data/countries/ie/programmes.json";
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

const FR = countryDataSchema.parse({
  meta: frCountryJson,
  scholarships: frScholarshipsJson,
  costs: frCostsJson,
  institutions: frInstitutionsJson,
  applications: frApplicationsJson,
  visa: frVisaJson,
  redFlags: frRedFlagsJson,
  programmes: frProgrammesJson,
});

const BE = countryDataSchema.parse({
  meta: beCountryJson,
  scholarships: beScholarshipsJson,
  costs: beCostsJson,
  institutions: beInstitutionsJson,
  applications: beApplicationsJson,
  visa: beVisaJson,
  redFlags: beRedFlagsJson,
  programmes: beProgrammesJson,
});

const DK = countryDataSchema.parse({
  meta: dkCountryJson,
  scholarships: dkScholarshipsJson,
  costs: dkCostsJson,
  institutions: dkInstitutionsJson,
  applications: dkApplicationsJson,
  visa: dkVisaJson,
  redFlags: dkRedFlagsJson,
  programmes: dkProgrammesJson,
});

const IE = countryDataSchema.parse({
  meta: ieCountryJson,
  scholarships: ieScholarshipsJson,
  costs: ieCostsJson,
  institutions: ieInstitutionsJson,
  applications: ieApplicationsJson,
  visa: ieVisaJson,
  redFlags: ieRedFlagsJson,
  programmes: ieProgrammesJson,
});

const REGISTRY: Record<string, KnowledgeBase> = {
  NL: toKnowledgeBase(NL),
  DE: toKnowledgeBase(DE),
  FI: toKnowledgeBase(FI),
  SE: toKnowledgeBase(SE),
  EE: toKnowledgeBase(EE),
  NO: toKnowledgeBase(NO),
  FR: toKnowledgeBase(FR),
  BE: toKnowledgeBase(BE),
  DK: toKnowledgeBase(DK),
  IE: toKnowledgeBase(IE),
};

function toKnowledgeBase(data: typeof NL | typeof DE | typeof FI | typeof SE | typeof EE | typeof NO | typeof FR | typeof BE | typeof DK | typeof IE): KnowledgeBase {
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
