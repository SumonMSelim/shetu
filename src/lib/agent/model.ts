import { BedrockModel } from "@strands-agents/sdk/models/bedrock";
import { config } from "@/lib/config";

/**
 * Output token limits are per model family: Nova rejects maxTokens above its
 * ~5k output cap, while Claude accepts more. Bangla and other non-Latin
 * scripts tokenize heavily, so the per-call limit is generous where the
 * model allows it; the request-level InvokeLimits still bound total cost.
 */
function outputLimit(modelId: string, fallback: number): number {
  if (modelId.includes("nova")) return 5000;
  return fallback;
}

/**
 * Builds the primary reasoning model used by the orchestrator and specialists.
 *
 * Credentials are resolved by the AWS SDK's default provider chain, so in
 * production this picks up the ECS task IAM role automatically and no secrets
 * live in code or env. Locally it uses your configured AWS profile.
 */
export function primaryModel(): BedrockModel {
  return new BedrockModel({
    modelId: config.bedrock.modelId,
    region: config.aws.region,
    temperature: 0.3, // Low: we want accurate, grounded guidance, not creativity.
    maxTokens: outputLimit(config.bedrock.modelId, 8192),
  });
}

/** A cheaper, faster model for lightweight specialist work (e.g. IELTS drills). */
export function fastModel(): BedrockModel {
  return new BedrockModel({
    modelId: config.bedrock.fastModelId,
    region: config.aws.region,
    temperature: 0.4,
    maxTokens: outputLimit(config.bedrock.fastModelId, 4096),
  });
}
