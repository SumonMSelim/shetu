import { BedrockModel } from "@strands-agents/sdk/models/bedrock";
import { config } from "@/lib/config";

/**
 * Builds the primary reasoning model used by the orchestrator and specialists.
 *
 * Credentials are resolved by the AWS SDK's default provider chain, so in
 * production this picks up the App Runner / ECS task IAM role automatically and
 * no secrets live in code or env. Locally it uses your configured AWS profile.
 */
export function primaryModel(): BedrockModel {
  return new BedrockModel({
    modelId: config.bedrock.modelId,
    region: config.aws.region,
    temperature: 0.3, // Low: we want accurate, grounded guidance, not creativity.
    maxTokens: 2048,
  });
}

/** A cheaper, faster model for lightweight specialist work (e.g. IELTS drills). */
export function fastModel(): BedrockModel {
  return new BedrockModel({
    modelId: config.bedrock.fastModelId,
    region: config.aws.region,
    temperature: 0.4,
    maxTokens: 2048,
  });
}
