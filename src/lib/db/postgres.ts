import { Pool } from "pg";

/**
 * Postgres pool for the programme catalogue (RDS, private within the VPC).
 *
 * Configuration comes from the environment, which the task definition injects:
 * SHETU_DB_HOST, SHETU_DB_PORT, SHETU_DB_NAME, SHETU_DB_USER and the
 * SHETU_DB_PASSWORD secret. Locally these are usually absent (the database is
 * not reachable from a laptop), and callers fall back to the bundled JSON
 * records; dbConfigured() tells them whether the DB path is available.
 */

let _pool: Pool | undefined;

export function dbConfigured(): boolean {
  return Boolean(process.env.SHETU_DB_HOST && process.env.SHETU_DB_PASSWORD);
}

export function dbPool(): Pool {
  if (!_pool) {
    _pool = new Pool({
      host: process.env.SHETU_DB_HOST,
      port: Number(process.env.SHETU_DB_PORT ?? 5432),
      database: process.env.SHETU_DB_NAME ?? "shetu",
      user: process.env.SHETU_DB_USER ?? "shetu",
      password: process.env.SHETU_DB_PASSWORD,
      ssl: { rejectUnauthorized: false },
      max: 4,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 8_000,
    });
  }
  return _pool;
}
