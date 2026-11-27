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

/** Positive integer override from the environment, else the fallback. */
function intFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

export const config = {
  app: {
    url: process.env.AUTH_URL ?? "http://localhost:3000",
    name: "Shetu",
    tagline: "A trusted guide to studying abroad",
  },
  aws: {
    region: process.env.AWS_REGION ?? "us-east-1",
  },
  bedrock: {
    /**
     * Primary reasoning model (orchestrator + specialists). Amazon Nova Pro:
     * a first-party model, billed under the generic "Amazon Bedrock" service
     * row, which the account's credits cover (the Anthropic rows bill gross).
     * Rollback to Claude if quality regresses: SHETU_MODEL_ID=us.anthropic.claude-sonnet-4-6
     */
    modelId: process.env.SHETU_MODEL_ID ?? "us.amazon.nova-pro-v1:0",
    /** Cheaper/faster model for lightweight side calls (e.g. IELTS drills). */
    fastModelId:
      process.env.SHETU_FAST_MODEL_ID ?? "us.amazon.nova-2-lite-v1:0",
  },
  storage: {
    vaultBucket: process.env.SHETU_VAULT_BUCKET ?? "shetu-vault",
    tableName: process.env.SHETU_TABLE_NAME ?? "shetu-app",
  },
  limits: {
    /** Messages a user may send per day (abuse and cost guardrail). */
    dailyChatMessages: intFromEnv("SHETU_DAILY_CHAT_LIMIT", 30),
    /**
     * Agent loop caps per chat turn. Set on the orchestrator's stream call,
     * they also bind every specialist it delegates to (agents-as-tools joins
     * the parent's limits), so a looping delegation cannot burn tokens freely.
     */
    burst: {
      /** Per-minute limits (abuse guardrail next to the daily quota). */
      chat: intFromEnv("SHETU_BURST_CHAT", 15),
      vault: intFromEnv("SHETU_BURST_VAULT", 20),
      mentorship: intFromEnv("SHETU_BURST_MENTORSHIP", 5),
      gdpr: intFromEnv("SHETU_BURST_GDPR", 3),
      conversationDelete: intFromEnv("SHETU_BURST_CONV_DELETE", 10),
    },
    agentTurns: intFromEnv("SHETU_AGENT_TURNS", 14),
    agentOutputTokens: intFromEnv("SHETU_AGENT_OUTPUT_TOKENS", 24_000),
    agentTotalTokens: intFromEnv("SHETU_AGENT_TOTAL_TOKENS", 240_000),
  },
} as const;

/** Read a required secret only when it is actually needed. */
export function authSecret(): string {
  return required("AUTH_SECRET", process.env.AUTH_SECRET);
}
