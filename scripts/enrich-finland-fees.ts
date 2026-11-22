/**
 * Finland fee enrichment.
 *
 * The Opintopolku SEARCH payload carries no tuition data, but the per-
 * implementation (toteutus) detail does: metadata.opetus.maksut[] holds the
 * academic-year tuition for non-EU/EEA students, plus a better planned-
 * duration field (suunniteltuKestoKuukaudet) than the credits heuristic.
 *
 * For each Finland record: koulutus oid (from the record id) -> its first
 * toteutus -> toteutus detail -> merge tuitionNonEu (EUR / academic year)
 * and durationMonths into the record, re-stamping the verification date.
 * Re-running re-fetches and writes only on value changes.
 *
 * Not part of CI: live Opintopolku calls (~1,440 requests, several minutes).
 * Usage: npm run enrich:finland-fees
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { todayIso } from "../src/lib/knowledge/draft";

const ROOT = process.cwd();
const FILE = join(ROOT, "data", "countries", "fi", "programmes.json");
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125.0 Safari/537.36";

const getJson = async (url: string): Promise<unknown> => {
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
};

interface FiRecord {
  id: string;
  name: string;
  tuitionNonEu?: number;
  durationMonths?: number;
  notes?: string;
  provenance: { retrieved: string; source: string; sourceUrl: string; period?: string };
}

interface ToteutusDetail {
  metadata?: {
    opetus?: {
      maksut?: { maksullisuustyyppi?: string; maksunMaara?: number }[] | null;
      suunniteltuKestoKuukaudet?: number;
    } | null;
  };
  toteutukset?: { oid?: string }[];
}

// Sane annual tuition band for Finnish higher education (non-EU/EEA).
// Values outside it are source-data errors: drop them rather than serve
// a figure a student would act on.
const FEE_MIN = 1000;
const FEE_MAX = 50000;

const records = JSON.parse(readFileSync(FILE, "utf8")) as FiRecord[];
const today = todayIso();

let enriched = 0;
let feeFound = 0;
let withoutImplementation = 0;
let failed = 0;
let durationUpdated = 0;
let implausibleRemoved = 0;

for (let i = 0; i < records.length; i++) {
  const rec = records[i];
  const koulutusOid = rec.id.replace(/^fi-/, "").replace(/-/g, ".");
  try {
    const koulutus = (await getJson(`https://opintopolku.fi/konfo-backend/koulutus/${koulutusOid}`)) as ToteutusDetail;
    const toteutusOid = koulutus.toteutukset?.[0]?.oid;
    if (!toteutusOid) {
      withoutImplementation += 1;
      continue;
    }
    const toteutus = (await getJson(`https://opintopolku.fi/konfo-backend/toteutus/${toteutusOid}`)) as ToteutusDetail;
    const opetus = toteutus.metadata?.opetus ?? {};

    // Academic-year tuition for non-EU/EEA students (the only fee type the
    // source publishes here).
    const yearFee = (opetus.maksut ?? []).find((m) =>
      /lukuvuosimaksu|tuition/i.test(m.maksullisuustyyppi ?? ""),
    );

    let changed = false;
    const plausible =
      yearFee?.maksunMaara !== undefined &&
      yearFee.maksunMaara >= FEE_MIN &&
      yearFee.maksunMaara <= FEE_MAX;
    if (plausible && rec.tuitionNonEu !== yearFee?.maksunMaara) {
      rec.tuitionNonEu = yearFee?.maksunMaara;
      changed = true;
      feeFound += 1;
    }
    // An implausible stored fee is removed (no figure beats a wrong one).
    if (rec.tuitionNonEu !== undefined && (rec.tuitionNonEu < FEE_MIN || rec.tuitionNonEu > FEE_MAX)) {
      delete rec.tuitionNonEu;
      changed = true;
      implausibleRemoved += 1;
    }
    const kesto = opetus.suunniteltuKestoKuukaudet;
    if (kesto && rec.durationMonths !== kesto) {
      rec.durationMonths = kesto;
      changed = true;
      durationUpdated += 1;
    }
    if (changed) {
      rec.provenance.retrieved = today;
      enriched += 1;
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${records.length} processed...`);
    await new Promise((r) => setTimeout(r, 300));
  } catch (err) {
    failed += 1;
    if (failed <= 3) console.log(`  failed for ${rec.id}: ${String(err).slice(0, 120)}`);
  }
}

writeFileSync(FILE, JSON.stringify(records, null, 2) + "\n", "utf8");
console.log(
  `\nEnrichment complete: ${enriched} records updated (${feeFound} gained fees, ${implausibleRemoved} implausible fees removed, ${durationUpdated} duration fixes), ${withoutImplementation} without an implementation, ${failed} failed.`,
);
console.log("Review the git diff, then commit; CI re-validates and the deploy ships the fees.");
