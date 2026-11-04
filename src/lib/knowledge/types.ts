/**
 * Knowledge-base types.
 *
 * The knowledge base is the single source of truth the agents are allowed to
 * cite. Every record carries provenance (`source`, `sourceUrl`) so the agent
 * can attribute each factual claim and never has to invent numbers. The schema
 * is country-agnostic by design: the demo ships Netherlands data, but adding
 * another destination is purely a data operation.
 */

export interface Provenance {
  /** Human-readable source label, e.g. "Study in NL - Tuition fees". */
  source: string;
  /** Canonical URL the fact can be verified against. */
  sourceUrl: string;
  /** ISO date the fact was last checked against the source. */
  retrieved: string;
  /** Academic year or period the figures apply to, when relevant. */
  period?: string;
}

/** A funding opportunity (scholarship, grant, loan scheme). */
export interface Scholarship {
  id: string;
  name: string;
  /** e.g. "government", "university", "eu", "external". */
  provider: string;
  /** Short plain-language summary. */
  summary: string;
  /** Monetary value, expressed honestly (one-off vs recurring, partial vs full). */
  value: string;
  /** Whether it covers full tuition. Kept explicit to fight sugar-coating. */
  coversFullTuition: boolean;
  /** Who can apply, in plain terms. */
  eligibility: string[];
  /** Level(s) it applies to. */
  levels: ("bachelor" | "master" | "phd")[];
  /** Hard truths applicants are often not told. */
  caveats: string[];
  provenance: Provenance;
}

/** A cost line item for studying in the destination. */
export interface CostItem {
  id: string;
  /** e.g. "Statutory tuition fee", "Living costs", "Health insurance". */
  label: string;
  category: "tuition" | "living" | "visa" | "insurance" | "upfront" | "other";
  /** Amount in the destination currency. */
  amount: number;
  currency: string;
  /** "year" | "month" | "once". */
  per: "year" | "month" | "once";
  /** When a single figure is misleading, give the realistic range. */
  rangeLow?: number;
  rangeHigh?: number;
  notes: string;
  provenance: Provenance;
}

/** An institution type or named institution. */
export interface Institution {
  id: string;
  name: string;
  /** "research-university" | "university-of-applied-sciences" | "institute". */
  type: string;
  summary: string;
  provenance: Provenance;
}

/** An application-process fact (requirements, deadlines, English tests). */
export interface ApplicationFact {
  id: string;
  topic: string;
  detail: string;
  provenance: Provenance;
}

/** A visa / residence-permit fact. */
export interface VisaFact {
  id: string;
  topic: string;
  detail: string;
  provenance: Provenance;
}

/** A known agency red flag plus what a legitimate process looks like instead. */
export interface RedFlag {
  id: string;
  /** The misleading claim or predatory tactic. */
  claim: string;
  /** Why it is a red flag. */
  why: string;
  /** What an honest process actually looks like. */
  reality: string;
  provenance?: Provenance;
}

/** The full knowledge base for one destination. */
export interface KnowledgeBase {
  /** ISO country code, e.g. "NL". */
  country: string;
  countryName: string;
  currency: string;
  scholarships: Scholarship[];
  costs: CostItem[];
  institutions: Institution[];
  applications: ApplicationFact[];
  visa: VisaFact[];
  redFlags: RedFlag[];
}
