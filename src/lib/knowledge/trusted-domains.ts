/**
 * Trusted link domains for the answer sanitizer and the eval link gate.
 *
 * The answering model may cite official sources it knows (an embassy page,
 * a university's admissions page) even when the tool output did not include
 * that exact URL. A link is reduced to plain text only when its host is NOT
 * in this list and NOT in the turn's tool outputs — invented domains such as
 * a plausible-looking brand site fail the gate.
 *
 * Extending this list is a reviewed change: every entry is a domain we trust
 * to cite. Keep entries lowercase, no scheme, no www.
 */
export const TRUSTED_DOMAINS: string[] = [
  // Shetu itself
  "mol.la",
  // Netherlands
  "studyinnl.org",
  "ind.nl",
  "gov.nl",
  "nuffic.nl",
  // Germany
  "daad.de",
  "diplo.de",
  "auswaertiges-amt.de",
  "research-in-germany.org",
  "study-in.de",  // DAAD "Study in Germany" portal
  // Finland
  "studyinfinland.fi",
  "opintopolku.fi",
  "studyinfo.fi",
  "migri.fi",
  // Sweden
  "universityadmissions.se",
  "studyinsweden.se",
  "migrationsverket.se",
  "uhr.se",
  // European Union
  "europa.eu",
  "erasmus-plus.ec.europa.eu",
];
