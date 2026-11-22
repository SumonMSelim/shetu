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
  for (const r of records) {
    const searchable = `${r.name} ${r.institution} ${r.field} ${r.city} ${r.level}`.toLowerCase();
    const hash = hashText(searchable);
    seenIds.push(r.id);

    const prior = await client.query(
      "SELECT content_hash, embedding::text AS embedding FROM programmes WHERE country = $1 AND id = $2",
      [cc, r.id],
    );
    const priorRow = prior.rows[0];
    let embeddingText: string | null = null;
    if (!priorRow || priorRow.content_hash !== hash) {
      try {
        const vec = await embed(searchable);
        embeddingText = `[${vec.join(",")}]`;
        embedded += 1;
      } catch (err) {
        // Embedding is an enhancement, not a requirement: full-text search
        // still works without it. Report and continue.
        failedEmbeds += 1;
        if (failedEmbeds <= 3) console.log(`  embed failed for ${r.id}: ${String(err).slice(0, 120)}`);
      }
    } else {
      embeddingText = priorRow.embedding;
      reused += 1;
    }

    const upsert = await client.query(
      `INSERT INTO programmes
        (country, id, name, institution, institution_type, level, field, language, city,
         duration_months, tuition_eu, tuition_non_eu, application_deadline, english_requirement,
         application_url, notes, provenance, verified_on, stale, content_hash, embedding)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21::vector)
       ON CONFLICT (country, id) DO UPDATE SET
         name = EXCLUDED.name, institution = EXCLUDED.institution,
         institution_type = EXCLUDED.institution_type, level = EXCLUDED.level,
         field = EXCLUDED.field, language = EXCLUDED.language, city = EXCLUDED.city,
         duration_months = EXCLUDED.duration_months, tuition_eu = EXCLUDED.tuition_eu,
         tuition_non_eu = EXCLUDED.tuition_non_eu, application_deadline = EXCLUDED.application_deadline,
         english_requirement = EXCLUDED.english_requirement, application_url = EXCLUDED.application_url,
         notes = EXCLUDED.notes, provenance = EXCLUDED.provenance, verified_on = EXCLUDED.verified_on,
         stale = EXCLUDED.stale, content_hash = EXCLUDED.content_hash, embedding = EXCLUDED.embedding`,
      [
        cc,
        r.id,
        r.name,
        r.institution,
        r.institutionType,
        r.level,
        r.field,
        r.language,
        r.city,
        r.durationMonths ?? null,
        r.tuitionEu ?? null,
        r.tuitionNonEu ?? null,
        r.applicationDeadline ?? null,
        r.englishRequirement ?? null,
        r.applicationUrl,
        r.notes ?? null,
        JSON.stringify(r.provenance),
        r.provenance.retrieved,
        isStaleProvenance(r.provenance, new Date()),
        hash,
        embeddingText,
      ],
    );
    if (upsert.rowCount === 1 && priorRow) updated += 1;
    else if (upsert.rowCount === 1) inserted += 1;
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
