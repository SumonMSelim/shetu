/**
 * Draft programme records from a source page (Track D stage 2).
 *
 * AI drafts, humans approve: this tool fetches a programme page (or reads a
 * saved copy for sites that block bots), asks the fast Bedrock model to
 * extract ONLY page-stated facts into the Programme shape, validates the
 * drafts against the schema, dedupes them against what is already in the
 * country file, and writes the additions to programmes.json. The human then
 * reviews the git diff, edits if needed, and opens the PR; CI validates
 * everything again.
 *
 * Usage:
 *   npm run draft:programmes -- --country nl --url https://... [--source-name "..."]
 *   npm run draft:programmes -- --country nl --file saved-page.html [--source-name "..."]
 *
 * If the site blocks the fetch (403), save the page from your browser and use
 * --file instead. Provenance stays honest either way: the record points at the
 * source URL and is stamped with today's date, and the reviewer confirms the
 * extracted facts against the page before merging.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { Agent } from "@strands-agents/sdk";
import { fastModel } from "../src/lib/agent/model";
import { htmlToText, mergeProgrammes, parseDraftJson, stampAndValidate, todayIso } from "../src/lib/knowledge/draft";
import type { Programme } from "../src/lib/knowledge/types";

// --- Args -------------------------------------------------------------------
const args = process.argv.slice(2);
function arg(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}
const country = (arg("country") ?? "nl").toLowerCase();
const url = arg("url");
const file = arg("file");
const sourceName = arg("source-name") ?? "Official programme page";

if (!url && !file) {
  console.error("Usage: npm run draft:programmes -- --country nl --url <url> | --file <saved-page> [--source-name \"...\"]");
  process.exit(2);
}
const sourceUrl = url ?? file!;

// --- Page text ----------------------------------------------------------------
let html: string;
if (file) {
  html = readFileSync(file!, "utf8");
} else {
  process.stdout.write(`Fetching ${url}... `);
  const res = await fetch(url!, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
      Accept: "text/html",
    },
  });
  if (!res.ok) {
    console.error(`HTTP ${res.status}.`);
    console.error(
      `This site blocks automated fetching. Save the page from your browser (Cmd+S, "Page Source" or complete page) and rerun with --file <saved-file>.`,
    );
    process.exit(2);
  }
  html = await res.text();
  console.log(`ok (${html.length} bytes)`);
}
const pageText = htmlToText(html).slice(0, 60_000);

// --- Country file (read fresh from disk: the script edits this file) ----------
const dataDir = new URL(`../data/countries/${country}/`, import.meta.url);
const programmesPath = new URL("programmes.json", dataDir);
const costsPath = new URL("costs.json", dataDir);
const existing = JSON.parse(readFileSync(programmesPath, "utf8")) as Programme[];
const costs = JSON.parse(readFileSync(costsPath, "utf8")) as {
  id: string;
  amount: number;
}[];
const statutoryFeeEu = costs.find((c) => c.id === "tuition-statutory")?.amount;
const countryLabel = country.toUpperCase();
const meta = JSON.parse(readFileSync(new URL("country.json", dataDir), "utf8")) as {
  currency: string;
};

// --- Extraction via the fast model --------------------------------------------
const SYSTEM = `You extract study-programme facts from university web pages into strict JSON.
Non-negotiable rules:
- Extract ONLY facts stated on the page. If a field is not stated, omit it entirely.
- Never guess or invent fees, deadlines, scores, or durations. Missing facts are fine.
- Do not copy text from anywhere except the page you are given.
- Output ONLY a JSON array in a \`\`\`json fence, no commentary.`;

const USER = `Extract every study programme described on this page into this JSON shape (omit fields not stated on the page):
{
  "institution": string,
  "institutionType": "research-university" | "university-of-applied-sciences" | "institute",
  "name": string,                       // official programme name, e.g. "MSc Computer Science"
  "level": "bachelor" | "master" | "phd",
  "field": string,
  "language": string,                   // teaching language, e.g. "English"
  "city": string,
  "durationMonths": number,             // only if stated
  "tuitionNonEu": number,               // institutional fee in EUR per YEAR, only if explicitly stated
  "applicationDeadline": string,        // only if explicitly stated, e.g. "1 April (non-EU)"
  "numerusFixus": boolean,              // only if the page says the programme has a selection cap
  "englishRequirement": string,         // only if explicitly stated, e.g. "IELTS 6.5"
  "notes": string                       // intakes, scholarship mentions, special conditions worth keeping
}

Page text follows.

PAGE:
${pageText}`;

process.stdout.write("Drafting with the fast model... ");
const agent = new Agent({
  name: "programme_drafter",
  model: fastModel(),
  systemPrompt: SYSTEM,
  printer: false,
});
let reply = "";
for await (const event of agent.stream(USER, {
  limits: { turns: 2, outputTokens: 4000, totalTokens: 30_000 },
})) {
  if (
    event.type === "modelStreamUpdateEvent" &&
    event.event.type === "modelContentBlockDeltaEvent" &&
    event.event.delta.type === "textDelta" &&
    event.event.delta.text
  ) {
    reply += event.event.delta.text;
  }
}
console.log("done.");

// --- Validate, stamp, dedupe, merge -------------------------------------------
let drafts: unknown[];
try {
  drafts = parseDraftJson(reply);
} catch (err) {
  console.error(`Drafter did not return usable JSON: ${String(err)}`);
  console.error("Reply was:", reply.slice(0, 600));
  process.exit(2);
}

const problems: string[] = [];
const retrieved = todayIso();
const valid: Programme[] = [];
for (const draft of drafts) {
  const p = stampAndValidate(
    draft,
    {
      sourceUrl: sourceUrl!,
      sourceName,
      retrieved,
      countryCode: country,
      currency: meta.currency,
      statutoryFeeEu,
    },
    problems,
  );
  if (p) valid.push(p);
}

const { added, skippedDuplicates } = mergeProgrammes(existing, valid);

console.log(`\nDrafts: ${drafts.length}, valid: ${valid.length}, new: ${added.length}, duplicates skipped: ${skippedDuplicates.length}`);
for (const d of skippedDuplicates) console.log(`  duplicate: ${d.id} (${d.url})`);
for (const problem of problems) console.log(`  rejected: ${problem}`);
for (const p of added) {
  console.log(`  + ${p.id}: ${p.name} @ ${p.institution} (${p.level}, ${p.city})`);
}

if (added.length === 0) {
  console.log("\nNothing new to add. programmes.json left unchanged.");
  process.exit(0);
}

// --- Write ----------------------------------------------------------------------
const updated = [...existing, ...added];
writeFileSync(programmesPath, JSON.stringify(updated, null, 2) + "\n", "utf8");
console.log(
  `\nWrote ${added.length} new programme(s) to data/countries/${countryLabel.toLowerCase()}/programmes.json.`,
);
console.log("Review the git diff carefully against the source page, then commit and open a PR.");
console.log(`CI will re-validate the file (schema, ids, provenance freshness for ${countryLabel}).`);
