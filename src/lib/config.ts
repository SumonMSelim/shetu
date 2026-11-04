/**
 * Central runtime configuration, read once from the environment.
 *
 * Every value has a safe default for local development except secrets, which
 * must be supplied via the environment. Nothing here is secret-bearing at rest:
 * credentials are resolved by the AWS SDK's default chain (IAM role in prod).
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === "") {
    // Fail loud at startup rather than deep inside a request.
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  app: {
    url: process.env.AUTH_URL ?? "http://localhost:3000",
    name: "Shetu",
    tagline: "Your honest guide to studying abroad",
  },
  aws: {
    region: process.env.AWS_REGION ?? "us-east-1",
  },
  bedrock: {
    /** Primary reasoning model (orchestrator + specialists). Current, non-legacy. */
    modelId: process.env.SHETU_MODEL_ID ?? "us.anthropic.claude-sonnet-4-6",
    /** Cheaper/faster model for lightweight side calls. Current, non-legacy. */
    fastModelId:
      process.env.SHETU_FAST_MODEL_ID ??
      "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  },
  storage: {
    vaultBucket: process.env.SHETU_VAULT_BUCKET ?? "shetu-vault",
    tableName: process.env.SHETU_TABLE_NAME ?? "shetu-app",
  },
} as const;

/** Read a required secret only when it is actually needed. */
export function authSecret(): string {
  return required("AUTH_SECRET", process.env.AUTH_SECRET);
}
