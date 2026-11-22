/**
 * Validate every country knowledge data file.
 *
 * Run in CI on every PR (npm run validate:data). Enforces, beyond the zod
 * schema:
 *   - ids are unique within each collection
 *   - every provenance `retrieved` date is within the freshness budget
 *     (400 days): a fee older than that fails, because serving stale figures
 *     is exactly the misinformation Shetu exists to prevent
 *   - non-EEA fee ranges are sane (low <= high)
 *   - every country directory contains all expected files
 *
 * Exit code 0 = all good, 1 = problems (listed with file and path).
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  applicationFactSchema,
  costItemSchema,
  countryMetaSchema,
  institutionSchema,
  programmeSchema,
  redFlagSchema,
  scholarshipSchema,
  visaFactSchema,
} from "../src/lib/knowledge/schema";

const DATA_DIR = join(import.meta.dirname, "..", "data", "countries");
const FRESHNESS_DAYS = 400;

type FileSpec = {
  schema: z.ZodTypeAny;
  collection?: string; // absent for country.json
};

const FILE_SPECS: Record<string, FileSpec> = {
  "country.json": { schema: countryMetaSchema },
  "scholarships.json": { schema: scholarshipSchema.array(), collection: "scholarships" },
  "costs.json": { schema: costItemSchema.array(), collection: "costs" },
  "institutions.json": { schema: institutionSchema.array(), collection: "institutions" },
  "applications.json": { schema: applicationFactSchema.array(), collection: "applications" },
  "visa.json": { schema: visaFactSchema.array(), collection: "visa" },
  "red-flags.json": { schema: redFlagSchema.array(), collection: "redFlags" },
  "programmes.json": { schema: programmeSchema.array(), collection: "programmes" },
};

const problems: string[] = [];

const countries = readdirSync(DATA_DIR, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

if (countries.length === 0) {
  problems.push(`no country directories found under ${DATA_DIR}`);
}

for (const cc of countries) {
  const dir = join(DATA_DIR, cc);
  for (const [file, spec] of Object.entries(FILE_SPECS)) {
    let raw: unknown;
    try {
      raw = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch (err) {
      problems.push(`${cc}/${file}: unreadable or invalid JSON: ${String(err).slice(0, 120)}`);
      continue;
    }
    const result = spec.schema.safeParse(raw);
    if (!result.success) {
      for (const issue of result.error.issues.slice(0, 10)) {
        problems.push(`${cc}/${file} ${issue.path.join(".")}: ${issue.message}`);
      }
      continue;
    }
    if (spec.collection) {
      checkCollection(cc, file, spec.collection, result.success ? (result.data as { id?: string; provenance?: unknown }[]) : []);
    }
  }
}

function checkCollection(
  cc: string,
  file: string,
  collection: string,
  items: { id?: string; provenance?: unknown }[],
): void {
  const ids = items.map((i) => i.id).filter(Boolean) as string[];
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    problems.push(`${cc}/${file}: duplicate ids in ${collection}: ${[...new Set(dupes)].join(", ")}`);
  }
  for (const item of items) {
    const p = item.provenance as { retrieved?: string } | undefined;
    if (!p?.retrieved) continue;
    const ageDays = Math.floor((Date.now() - new Date(p.retrieved).getTime()) / 86_400_000);
    if (ageDays > FRESHNESS_DAYS) {
      problems.push(
        `${cc}/${file}: stale provenance in ${collection} (id ${item.id}): retrieved ${p.retrieved}, ${ageDays} days ago (budget ${FRESHNESS_DAYS})`,
      );
    }
  }
  if (collection === "programmes") {
    for (const p of items as {
      id: string;
      tuitionNonEuRangeLow?: number;
      tuitionNonEuRangeHigh?: number;
      tuitionEu?: number;
      tuitionNonEu?: number;
    }[]) {
      if (
        p.tuitionNonEuRangeLow !== undefined &&
        p.tuitionNonEuRangeHigh !== undefined &&
        p.tuitionNonEuRangeLow > p.tuitionNonEuRangeHigh
      ) {
        problems.push(`${cc}/${file}: programme ${p.id} has fee range low > high`);
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`Data validation FAILED (${problems.length} problems):`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}

console.log(`Data validation passed: ${countries.length} country(ies), all files valid and fresh.`);
