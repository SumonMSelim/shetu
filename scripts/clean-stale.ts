/**
 * Old-data cleanup for the knowledge base.
 *
 * Lists records past the freshness budget and can retire them. Retired
 * records move from the serving file into data/countries/<CC>/retired/<collection>.json:
 * out of the retrieval path, still in git for audit. Nothing is silently
 * deleted, and retiring is always a human decision.
 *
 * Usage:
 *   npm run clean:stale                                   # list stale records
 *   npm run clean:stale -- --retire <recordId>            # retire one record
 *   npm run clean:stale -- --country nl --retire-all      # retire every stale record
 *
 * To re-verify instead of retiring, run the harvest for the source
 * (npm run harvest -- --force --source <id>) or check the source URL by hand.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  applicationFactSchema,
  costItemSchema,
  institutionSchema,
  programmeSchema,
  redFlagSchema,
  scholarshipSchema,
  visaFactSchema,
} from "../src/lib/knowledge/schema";
import { daysSince, markRetired, partitionByStaleness } from "../src/lib/knowledge/retire";

const ROOT = join(import.meta.dirname, "..");

const COLLECTIONS = {
  scholarships: scholarshipSchema,
  costs: costItemSchema,
  institutions: institutionSchema,
  applications: applicationFactSchema,
  visa: visaFactSchema,
  "red-flags": redFlagSchema,
  programmes: programmeSchema,
} as const;

const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const country = (arg("country") ?? "nl").toLowerCase();
const retireId = arg("retire");
const retireAll = args.includes("--retire-all");
const now = new Date();

const countryDir = join(ROOT, "data", "countries", country);
let retiredCount = 0;

for (const [collection] of Object.entries(COLLECTIONS)) {
  const path = join(countryDir, `${collection}.json`);
  if (!existsSync(path)) continue;
  const records = JSON.parse(readFileSync(path, "utf8")) as {
    id: string;
    provenance: { retrieved: string; sourceUrl: string };
  }[];

  if (retireId) {
    const target = records.find((r) => r.id === retireId);
    if (target) {
      retireOne(collection, path, [target]);
      retiredCount += 1;
    }
    continue;
  }

  const { stale, current } = partitionByStaleness(records, now);
  if (stale.length === 0) continue;

  console.log(`\n${collection}: ${stale.length} stale of ${records.length}`);
  for (const s of stale) {
    console.log(
      `  ${s.id}: retrieved ${s.provenance.retrieved} (${daysSince(s.provenance.retrieved, now)} days ago)`,
    );
    console.log(`    source: ${s.provenance.sourceUrl}`);
    console.log(`    re-verify via harvest, or retire: npm run clean:stale -- --retire ${s.id}`);
  }

  if (retireAll) {
    retireOne(collection, path, stale);
    retiredCount += stale.length;
    void current;
  }
}

if (retiredCount > 0) {
  console.log(`\nRetired ${retiredCount} record(s) into retired/ (out of the serving path, kept for audit).`);
} else if (!retireId) {
  console.log("No stale records. Everything is within the freshness budget.");
}

function retireOne(
  collection: string,
  servingPath: string,
  targets: { id: string; provenance: { retrieved: string; sourceUrl: string } }[],
): void {
  const serving = JSON.parse(readFileSync(servingPath, "utf8")) as {
    id: string;
    provenance: { retrieved: string; sourceUrl: string };
  }[];
  const ids = new Set(targets.map((t) => t.id));
  const kept = serving.filter((r) => !ids.has(r.id));
  const removed = serving.filter((r) => ids.has(r.id));

  const retiredDir = join(countryDir, "retired");
  const retiredPath = join(retiredDir, `${collection}.json`);
  const retired = existsSync(retiredPath)
    ? (JSON.parse(readFileSync(retiredPath, "utf8")) as unknown[])
    : [];
  writeFileSync(
    retiredPath,
    JSON.stringify([...retired, ...markRetired(removed, "stale: past freshness budget", now)], null, 2) + "\n",
    "utf8",
  );
  writeFileSync(servingPath, JSON.stringify(kept, null, 2) + "\n", "utf8");
}
