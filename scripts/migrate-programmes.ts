/**
 * Sync the country programme JSON files into Postgres ( programmes table ),
 * with embeddings for hybrid retrieval.
 *
 * - Idempotent: upserts by (country, id); re-embeds only when the searchable
 *   content changed (content_hash); removes DB rows for records that left the
 *   JSON files.
 * - Embeddings: Amazon Titan Embeddings v2 (1024 dims) via Bedrock. This is a
 *   retrieval vectorizer, not a second answering model.
 * - Needs the RDS endpoint (CDK output DbEndpoint) and AWS credentials; the
 *   master password is read from the stack's Secrets Manager secret.
 *
 * Usage: npm run migrate:programmes -- [--stack ShetuStack]
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import { createHash } from "node:crypto";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";
import { isStaleProvenance } from "../src/lib/knowledge/schema";
import { todayIso } from "../src/lib/knowledge/draft";

const REGION = process.env.AWS_REGION ?? "us-east-1";
const EMBED_MODEL = "amazon.titan-embed-text-v2:0";
const EMBED_DIMS = 1024;

const bedrock = new BedrockRuntimeClient({ region: REGION });

async function embed(text: string): Promise<number[]> {
  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: EMBED_MODEL,
      body: JSON.stringify({ inputText: text, dimensions: EMBED_DIMS, normalize: true }),
      contentType: "application/json",
      accept: "application/json",
    }),
  );
  const body = JSON.parse(Buffer.from(res.body).toString("utf8")) as { embedding: number[] };
  return body.embedding;
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 32);
}

const countryDirs = readdirSync(join(process.cwd(), "data", "countries"), {
  withFileTypes: true,
})
  .filter((d) => d.isDirectory())
  .map((d) => d.name);

// Connection details come from the environment: SHETU_DB_HOST and
// SHETU_DB_PASSWORD (the latter via `aws secretsmanager get-secret-value` on
// the stack's DbSecret), so no AWS SDK clients beyond the embedding call.
const host = process.env.SHETU_DB_HOST;
const password = process.env.SHETU_DB_PASSWORD;
if (!host || !password) {
  console.error(
    "Set SHETU_DB_HOST (CDK output DbEndpoint) and SHETU_DB_PASSWORD (aws secretsmanager get-secret-value on the stack's DbSecret, JSON field `password`).",
  );
  process.exit(2);
}
const client = new Client({
  host,
  port: 5432,
  database: "shetu",
  user: "shetu",
  password,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

await client.query("CREATE EXTENSION IF NOT EXISTS vector");
await client.query(`
  CREATE TABLE IF NOT EXISTS programmes (
    country char(2) NOT NULL,
    id text NOT NULL,
    name text NOT NULL,
    institution text NOT NULL,
    institution_type text NOT NULL,
    level text NOT NULL,
    field text NOT NULL,
    language text NOT NULL,
    city text NOT NULL,
    duration_months int,
    tuition_eu numeric,
    tuition_non_eu numeric,
    application_deadline text,
    english_requirement text,
    application_url text NOT NULL,
    notes text,
    provenance jsonb NOT NULL,
    verified_on date NOT NULL,
    stale boolean NOT NULL DEFAULT false,
    content_hash text NOT NULL,
    embedding vector(${EMBED_DIMS}),
    PRIMARY KEY (country, id),
    search tsvector GENERATED ALWAYS AS (
      to_tsvector('english', name || ' ' || institution || ' ' || field || ' ' || coalesce(city, ''))
    ) STORED
  )
`);
await client.query(
  `CREATE INDEX IF NOT EXISTS programmes_fts_idx ON programmes USING gin (search)`,
);
await client.query(
  `CREATE INDEX IF NOT EXISTS programmes_embedding_idx ON programmes USING hnsw (embedding vector_cosine_ops)`,
);

const today = todayIso();
let embedded = 0;
let reused = 0;
let inserted = 0;
let updated = 0;
let removed = 0;
let failedEmbeds = 0;

for (const cc of countryDirs) {
  const records = JSON.parse(
    readFileSync(join(process.cwd(), "data", "countries", cc, "programmes.json"), "utf8"),
  ) as {
    id: string;
    name: string;
    institution: string;
    institutionType: string;
    level: string;
    field: string;
    language: string;
    city: string;
    durationMonths?: number;
    tuitionEu?: number;
    tuitionNonEu?: number;
    applicationDeadline?: string;
    englishRequirement?: string;
    applicationUrl: string;
    notes?: string;
    provenance: { retrieved: string; period?: string };
  }[];

  const seenIds: string[] = [];

  // One SELECT for the whole country instead of one per record: the seed run
  // did everything sequentially and took ~30 minutes for 3,585 records over
  // the public internet. Batching brings a full refresh to minutes.
  const priorRes = await client.query(
    "SELECT id, content_hash, embedding::text AS embedding FROM programmes WHERE country = $1",
    [cc],
  );
  const priorById = new Map<string, { content_hash: string; embedding: string }>(
    (priorRes.rows as { id: string; content_hash: string; embedding: string }[]).map((row) => [row.id, row]),
  );

  interface Prepared {
    r: (typeof records)[number];
    hash: string;
    embeddingText: string | null;
  }
  const prepared: Prepared[] = [];

  // Phase 1: decide embeddings needed, embed with a small worker pool
  // (Bedrock rate limits apply; 6 concurrent calls is polite and fast).
  const toEmbed: { index: number; searchable: string }[] = [];
  for (let i = 0; i < records.length; i++) {
    const r = records[i];
    const searchable = `${r.name} ${r.institution} ${r.field} ${r.city} ${r.level}`.toLowerCase();
    const hash = hashText(searchable);
    seenIds.push(r.id);
    const priorRow = priorById.get(r.id);
    if (!priorRow || priorRow.content_hash !== hash) toEmbed.push({ index: i, searchable });
    prepared.push({ r, hash, embeddingText: priorRow?.embedding ?? null });
  }

  const CONCURRENCY = 6;
  let next = 0;
  let done = 0;
  const worker = async () => {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const job = toEmbed[next];
      next += 1;
      if (job === undefined) return;
      try {
        const vec = await embed(job.searchable);
        prepared[job.index].embeddingText = `[${vec.join(",")}]`;
        embedded += 1;
      } catch (err) {
        // Embedding is an enhancement, not a requirement: full-text search
        // still works without it. Report and continue.
        failedEmbeds += 1;
        if (failedEmbeds <= 3) console.log(`  embed failed for ${prepared[job.index].r.id}: ${String(err).slice(0, 120)}`);
      }
      done += 1;
      if (done % 200 === 0) console.log(`  ${cc}: embedded ${done}/${toEmbed.length}`);
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, toEmbed.length) }, worker));
  reused += records.length - toEmbed.length;

  // Phase 2: chunked multi-row upserts (25 rows x 21 cols per statement).
  for (let i = 0; i < prepared.length; i += 25) {
    const chunk = prepared.slice(i, i + 25);
    const values: unknown[] = [];
    const rowsSql: string[] = [];
    chunk.forEach((p, j) => {
      const b = j * 21;
      rowsSql.push(
        `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17}::jsonb,$${b + 18}::date,$${b + 19}::boolean,$${b + 20},$${b + 21}::vector)`,
      );
      values.push(
        cc,
        p.r.id,
        p.r.name,
        p.r.institution,
        p.r.institutionType,
        p.r.level,
        p.r.field,
        p.r.language,
        p.r.city,
        p.r.durationMonths ?? null,
        p.r.tuitionEu ?? null,
        p.r.tuitionNonEu ?? null,
        p.r.applicationDeadline ?? null,
        p.r.englishRequirement ?? null,
        p.r.applicationUrl,
        p.r.notes ?? null,
        JSON.stringify(p.r.provenance),
        p.r.provenance.retrieved,
        isStaleProvenance(p.r.provenance, new Date()),
        p.hash,
        p.embeddingText,
      );
    });
    await client.query(
      `INSERT INTO programmes
        (country, id, name, institution, institution_type, level, field, language, city,
         duration_months, tuition_eu, tuition_non_eu, application_deadline, english_requirement,
         application_url, notes, provenance, verified_on, stale, content_hash, embedding)
       VALUES ${rowsSql.join(",")}
       ON CONFLICT (country, id) DO UPDATE SET
         name = EXCLUDED.name, institution = EXCLUDED.institution,
         institution_type = EXCLUDED.institution_type, level = EXCLUDED.level,
         field = EXCLUDED.field, language = EXCLUDED.language, city = EXCLUDED.city,
         duration_months = EXCLUDED.duration_months, tuition_eu = EXCLUDED.tuition_eu,
         tuition_non_eu = EXCLUDED.tuition_non_eu, application_deadline = EXCLUDED.application_deadline,
         english_requirement = EXCLUDED.english_requirement, application_url = EXCLUDED.application_url,
         notes = EXCLUDED.notes, provenance = EXCLUDED.provenance, verified_on = EXCLUDED.verified_on,
         stale = EXCLUDED.stale, content_hash = EXCLUDED.content_hash,
         embedding = COALESCE(EXCLUDED.embedding, programmes.embedding)`,
      values,
    );
    for (const p of chunk) {
      if (priorById.has(p.r.id)) updated += 1;
      else inserted += 1;
    }
    console.log(`  ${cc}: upserted ${Math.min(i + 25, prepared.length)}/${prepared.length}`);
  }

  // Remove DB rows for records that left the JSON files (retired/cleaned).
  const del = await client.query(
    "DELETE FROM programmes WHERE country = $1 AND id <> ALL($2::text[])",
    [cc, seenIds],
  );
  removed += del.rowCount ?? 0;
}

await client.end();
console.log(
  `Migration complete: ${inserted} inserted, ${updated} updated, ${removed} removed, ${embedded} embedded, ${reused} reused, ${failedEmbeds} embed failures.`,
);
