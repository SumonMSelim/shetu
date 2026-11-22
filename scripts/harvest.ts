/**
 * The harvesting scheduler (deterministic, no LLM).
 *
 * Maintains a registry of sources (data/sources.json), each with a re-check
 * interval in days. Running `npm run harvest` fetches every enabled source
 * that is due, extracts figures with its adapter (deterministic code, no
 * model), merges them into the country data files, and records run state
 * locally (data/state/runs.json, not committed).
 *
 * Output discipline:
 *   - unchanged figure -> provenance `retrieved` re-stamped (re-verified)
 *   - changed figure  -> record updated; the git diff shows exactly what
 *     changed, and the human approves it in the PR
 *   - adapter missing or page unfetchable -> reported, nothing guessed
 *
 * In CI (see .github/workflows/harvest.yml) this runs on a cron and opens a
 * pull request whenever the diff is non-empty.
 *
 * Usage:
 *   npm run harvest                 # run every enabled source that is due
 *   npm run harvest -- --source <id> [--force]
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { sourceRegistrySchema } from "../src/lib/knowledge/schema";
import { getAdapter } from "../src/lib/knowledge/sources/studyinnl-tuition";
import { applyFigureUpdates, isDue } from "../src/lib/knowledge/sources/schedule";
import { runFinderHarvest } from "../src/lib/knowledge/sources/studyinnl-finder";
import { runOpintopolkuHarvest } from "../src/lib/knowledge/sources/opintopolku-finder";
import { runSeFinderHarvest } from "../src/lib/knowledge/sources/se-finder";
import { runDaadHarvest } from "../src/lib/knowledge/sources/daad-finder";
import { mergeProgrammes } from "../src/lib/knowledge/draft";
import { htmlToText, todayIso } from "../src/lib/knowledge/draft";
import type { Programme } from "../src/lib/knowledge/types";

const ROOT = join(import.meta.dirname, "..");
const STATE_DIR = join(ROOT, "data", "state");
const STATE_PATH = join(STATE_DIR, "runs.json");

// --- Args -------------------------------------------------------------------
const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const onlySource = arg("source");
const force = args.includes("--force");

// --- Registry and state -------------------------------------------------------
const registry = sourceRegistrySchema.parse(
  JSON.parse(readFileSync(join(ROOT, "data", "sources.json"), "utf8")),
);

interface RunState {
  sources: Record<string, { lastRunAt: string; lastStatus: "ok" | "failed"; lastSummary: string }>;
}
const state: RunState = existsSync(STATE_PATH)
  ? JSON.parse(readFileSync(STATE_PATH, "utf8"))
  : { sources: {} };

const now = new Date();
const today = todayIso(now);

// --- Run due sources -----------------------------------------------------------
const due = registry.filter((s) => {
  if (!s.enabled) return false;
  if (onlySource) return s.id === onlySource;
  if (force && onlySource) return true;
  return force || isDue(state.sources[s.id]?.lastRunAt, s.intervalDays, now);
});

if (due.length === 0) {
  console.log("No sources are due. Use --source <id> --force to run one anyway.");
  process.exit(0);
}

let anyFailed = false;

for (const source of due) {
  console.log(`\n=== ${source.id} (${source.kind}, every ${source.intervalDays} days) ===`);

  // Bulk programme finders: their own deterministic fetch + mapping path.
  if (source.kind === "portal-finder") {
    try {
      let programmes: Programme[];
      let total = 0;
      let skipped: { id: string; reason: string }[] = [];
      if (source.adapter === "studyinnl-finder") {
        const run = await runFinderHarvest(source.country, today, (fetched, t) =>
          console.log(`  fetched ${fetched}/${t} programmes`),
        );
        programmes = run.programmes;
        total = run.total;
        skipped = run.skipped;
      } else if (source.adapter === "opintopolku-finder") {
        const run = await runOpintopolkuHarvest(source.country, today, (fetched, t) =>
          console.log(`  fetched ${fetched}/${t} programmes`),
        );
        programmes = run.programmes;
        total = run.total;
        skipped = run.skipped;
      } else if (source.adapter === "se-finder") {
        const run = await runSeFinderHarvest(source.country, today, (fetched, t) =>
          console.log(`  fetched ${fetched}/${t} programmes`),
        );
        programmes = run.programmes;
        total = run.total;
        skipped = run.skipped;
      } else if (source.adapter === "daad-finder") {
        const run = await runDaadHarvest(today, (fetched, t) =>
          console.log(`  fetched ${fetched}/${t} programmes`),
        );
        programmes = run.programmes;
        total = run.total;
        skipped = run.skipped;
      } else {
        console.log(`  no finder adapter implemented for "${source.adapter}"; skipping.`);
        anyFailed = true;
        continue;
      }
      const programmesPath = join(
        ROOT,
        "data",
        "countries",
        source.country.toLowerCase(),
        "programmes.json",
      );
      const existing = JSON.parse(readFileSync(programmesPath, "utf8")) as Programme[];
      const { added, updated, unchanged } = mergeProgrammes(existing, programmes);
      if (added.length > 0 || updated.length > 0) {
        writeFileSync(programmesPath, JSON.stringify([...existing, ...added], null, 2) + "\n", "utf8");
      }
      console.log(
        `  API total: ${total}, mapped: ${programmes.length}, non-degree skipped: ${skipped.length}`,
      );
      console.log(`  added: ${added.length}, updated: ${updated.length}, unchanged: ${unchanged}`);
      for (const u of updated.slice(0, 5)) console.log(`  CHANGED ${u.id}: ${u.changes.join(", ")}`);
      if (added.length > 0 || updated.length > 0) {
        console.log("  ^ review the git diff before merging the PR.");
      }
      state.sources[source.id] = {
        lastRunAt: today,
        lastStatus: "ok",
        lastSummary: `mapped ${programmes.length}, added ${added.length}, updated ${updated.length}`,
      };
    } catch (err) {
      anyFailed = true;
      console.log(`  FAILED: ${String(err).slice(0, 200)}`);
      state.sources[source.id] = { lastRunAt: today, lastStatus: "failed", lastSummary: String(err).slice(0, 200) };
    }
    continue;
  }

  const adapter = getAdapter(source.adapter);
  if (!adapter) {
    console.log(`  adapter "${source.adapter}" not implemented yet; skipping.`);
    state.sources[source.id] = {
      lastRunAt: state.sources[source.id]?.lastRunAt ?? today,
      lastStatus: state.sources[source.id]?.lastStatus ?? "failed",
      lastSummary: "adapter not implemented",
    };
    anyFailed = true;
    continue;
  }

  try {
    const res = await fetch(source.url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
        Accept: "text/html",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const pageText = htmlToText(await res.text());
    console.log(`  fetched ${source.url} (${pageText.length} chars of text)`);

    const { figures, warnings } = adapter.extract(pageText);
    for (const w of warnings) console.log(`  warning: ${w}`);
    if (figures.length === 0) {
      throw new Error("adapter extracted no figures (page wording changed?)");
    }

    const costsPath = join(ROOT, "data", "countries", source.country.toLowerCase(), "costs.json");
    const costs = JSON.parse(readFileSync(costsPath, "utf8")) as Parameters<typeof applyFigureUpdates>[0];
    const result = applyFigureUpdates(costs, figures, today);
    writeFileSync(costsPath, JSON.stringify(costs, null, 2) + "\n", "utf8");

    for (const c of result.reverified) console.log(`  re-verified unchanged: ${c}`);
    for (const c of result.changes) console.log(`  CHANGED: ${c.costId}.${c.field}: ${JSON.stringify(c.was)} -> ${JSON.stringify(c.now)}`);
    if (result.changed) console.log("  ^ review this change in the git diff before merging the PR.");

    state.sources[source.id] = { lastRunAt: today, lastStatus: "ok", lastSummary: result.changed ? `${result.changes.length} figure(s) changed` : "all figures re-verified unchanged" };
  } catch (err) {
    anyFailed = true;
    console.log(`  FAILED: ${String(err).slice(0, 200)}`);
    state.sources[source.id] = {
      lastRunAt: today,
      lastStatus: "failed",
      lastSummary: String(err).slice(0, 200),
    };
  }
}

// --- Persist state (local only; not committed) ---------------------------------
mkdirSync(STATE_DIR, { recursive: true });
writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
console.log("\nHarvest complete. State written to data/state/runs.json (gitignored).");
if (anyFailed) process.exit(1);
