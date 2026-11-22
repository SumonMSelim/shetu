import { z } from "zod";

/**
 * Zod schemas for the country knowledge data files (data/countries/<CC>/*.json).
 *
 * The JSON files are the source of truth and this schema is its gate: the app
 * validates at import, CI validates on every PR, and the sourcing pipeline
 * (Track D stage 2) drafts records against it. Keep this file in sync with
 * types.ts; the boot-time validation makes drift fail loudly rather than ship
 * silently.
 */

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "must be an ISO date (YYYY-MM-DD)");
const httpsUrl = z.string().url().refine((u) => u.startsWith("https://"), "must be https");

export const provenanceSchema = z.object({
  source: z.string().min(3),
  sourceUrl: httpsUrl,
  retrieved: isoDate,
  period: z.string().optional(),
});

const levels = ["bachelor", "master", "phd"] as const;

export const scholarshipSchema = z.object({
  id: z.string().min(3),
  name: z.string().min(3),
  provider: z.string().min(2),
  summary: z.string().min(10),
  value: z.string().min(3),
  coversFullTuition: z.boolean(),
  eligibility: z.array(z.string().min(3)).min(1),
  levels: z.array(z.enum(levels)).min(1),
  caveats: z.array(z.string().min(3)).min(1),
  provenance: provenanceSchema,
});

export const costItemSchema = z.object({
  id: z.string().min(3),
  label: z.string().min(3),
  category: z.enum(["tuition", "living", "visa", "insurance", "upfront", "other"]),
  amount: z.number().nonnegative(),
  currency: z.string().length(3),
  per: z.enum(["year", "month", "once"]),
  rangeLow: z.number().optional(),
  rangeHigh: z.number().optional(),
  notes: z.string().min(10),
  provenance: provenanceSchema,
});

export const institutionSchema = z.object({
  id: z.string().min(3),
  name: z.string().min(3),
  type: z.string().min(3),
  summary: z.string().min(10),
  provenance: provenanceSchema,
});

export const applicationFactSchema = z.object({
  id: z.string().min(3),
  topic: z.string().min(3),
  detail: z.string().min(10),
  provenance: provenanceSchema,
});

export const visaFactSchema = z.object({
  id: z.string().min(3),
  topic: z.string().min(3),
  detail: z.string().min(10),
  provenance: provenanceSchema,
});

export const redFlagSchema = z.object({
  id: z.string().min(3),
  claim: z.string().min(5),
  why: z.string().min(10),
  reality: z.string().min(10),
  provenance: provenanceSchema.optional(),
});

export const programmeSchema = z.object({
  id: z.string().min(3),
  institution: z.string().min(3),
  institutionType: z.string().min(3),
  name: z.string().min(3),
  level: z.enum(levels),
  field: z.string().min(3),
  language: z.string().min(3),
  city: z.string().min(2),
  durationMonths: z.number().int().positive().optional(),
  tuitionEu: z.number().positive().optional(),
  tuitionNonEu: z.number().positive().optional(),
  tuitionNonEuRangeLow: z.number().positive().optional(),
  tuitionNonEuRangeHigh: z.number().positive().optional(),
  currency: z.string().length(3),
  applicationDeadline: z.string().min(3).optional(),
  numerusFixus: z.boolean().optional(),
  englishRequirement: z.string().min(3).optional(),
  applicationUrl: httpsUrl,
  notes: z.string().min(10).optional(),
  provenance: provenanceSchema,
});

export const countryMetaSchema = z.object({
  country: z.string().length(2),
  countryName: z.string().min(3),
  currency: z.string().length(3),
});

export const countryDataSchema = z.object({
  meta: countryMetaSchema,
  scholarships: z.array(scholarshipSchema),
  costs: z.array(costItemSchema),
  institutions: z.array(institutionSchema),
  applications: z.array(applicationFactSchema),
  visa: z.array(visaFactSchema),
  redFlags: z.array(redFlagSchema),
  programmes: z.array(programmeSchema),
});

export type CountryData = z.infer<typeof countryDataSchema>;

/**
 * A harvesting source: one page the scheduler re-checks every intervalDays.
 * `adapter` names a deterministic extractor in src/lib/knowledge/sources/.
 */
export const sourceSchema = z.object({
  id: z.string().min(3),
  country: z.string().length(2),
  kind: z.enum(["fees-page", "portal-finder", "programme-page"]),
  url: httpsUrl,
  adapter: z.string().min(3),
  intervalDays: z.number().int().min(1).max(365),
  enabled: z.boolean().default(true),
  notes: z.string().optional(),
});

export const sourceRegistrySchema = z.array(sourceSchema);

/** A figure an adapter extracted from a source page, keyed by cost record id. */
export const costFigureUpdateSchema = z.object({
  costId: z.string().min(3),
  amount: z.number().optional(),
  rangeLow: z.number().optional(),
  rangeHigh: z.number().optional(),
  period: z.string().optional(),
});

export type CostFigureUpdate = z.infer<typeof costFigureUpdateSchema>;
export type SourceConfig = z.infer<typeof sourceSchema>;
