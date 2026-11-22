import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { config } from "@/lib/config";

/**
 * Query embedding for hybrid retrieval. This is a retrieval component (a
 * deterministic vectorizer), not a second answering model: it turns the
 * student's search text into the vector that selects candidates from the
 * validated programme records.
 */

const bedrock = new BedrockRuntimeClient({ region: config.aws.region });

export async function embedQuery(text: string): Promise<string> {
  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId: "amazon.titan-embed-text-v2:0",
      body: JSON.stringify({ inputText: text, dimensions: 1024, normalize: true }),
      contentType: "application/json",
      accept: "application/json",
    }),
  );
  const body = JSON.parse(Buffer.from(res.body).toString("utf8")) as { embedding: number[] };
  return `[${body.embedding.join(",")}]`;
}
