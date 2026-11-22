import { UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { UpdateTimeToLiveCommand } from "@aws-sdk/client-dynamodb";
import { ddb, baseDdb } from "./clients";
import { config } from "@/lib/config";
import { logWarn } from "@/lib/observability/logger";

/**
 * Per-user daily chat quota.
 *
 * One item per user per day (SK = RATE#<yyyy-mm-dd>) incremented atomically
 * with ADD, so concurrent requests cannot race past the limit. The item sets a
 * `ttl` attribute that DynamoDB garbage-collects a few days later. TTL is
 * enabled on the table once per process (the call is idempotent), because the
 * table is provisioned outside CDK and this removes the manual step.
 */

let ttlEnsured = false;

function ensureChatTtl(): void {
  if (ttlEnsured) return;
  ttlEnsured = true;
  baseDdb()
    .send(
      new UpdateTimeToLiveCommand({
        TableName: config.storage.tableName,
        TimeToLiveSpecification: { AttributeName: "ttl", Enabled: true },
      }),
    )
    .catch((err) => {
      // Fine if TTL is already enabled on this attribute or managed elsewhere.
      logWarn("rate_limit.ttl_enable_skipped", err);
    });
}

export interface ChatQuota {
  allowed: boolean;
  used: number;
  limit: number;
}

/** Count one chat message against today's quota and say whether it passes. */
export async function consumeChatQuota(userId: string): Promise<ChatQuota> {
  ensureChatTtl();
  const limit = config.limits.dailyChatMessages;
  const day = new Date().toISOString().slice(0, 10);
  // Keep the counter for 3 days so the TTL sweeper has margin.
  const ttl = Math.floor(Date.now() / 1000) + 3 * 24 * 60 * 60;
  const res = await ddb().send(
    new UpdateCommand({
      TableName: config.storage.tableName,
      Key: { PK: `USER#${userId}`, SK: `RATE#${day}` },
      UpdateExpression: "ADD #c :one SET #t = :ttl, #d = :day",
      ExpressionAttributeNames: { "#c": "count", "#t": "ttl", "#d": "day" },
      ExpressionAttributeValues: { ":one": 1, ":ttl": ttl, ":day": day },
      ReturnValues: "ALL_NEW",
    }),
  );
  const used = Number((res.Attributes as { count?: number } | undefined)?.count ?? 0);
  return { allowed: used <= limit, used, limit };
}

// --- Burst limiting -----------------------------------------------------------

/** The minute-window key for a burst limiter (SK next to the daily counters). */
export function burstKey(route: string, window: string): string {
  return `RATE#BURST#${route}#${window}`;
}

/** Pure decision helper: the limiter allows counts up to and including the limit. */
export function burstAllowed(count: number, limit: number): boolean {
  return count <= limit;
}

/**
 * Minute-window burst limiter, same atomic-counter pattern as the daily
 * quota: one item per user+route+minute with a short TTL. Call before
 * expensive work; returns false when the user exceeded the per-minute limit.
 */
export async function consumeBurst(
  userId: string,
  route: string,
  limitPerMinute: number,
): Promise<boolean> {
  const window = new Date().toISOString().slice(0, 16); // YYYY-MM-DDTHH:MM
  const ttl = Math.floor(Date.now() / 1000) + 180;
  const res = await ddb().send(
    new UpdateCommand({
      TableName: config.storage.tableName,
      Key: { PK: `USER#${userId}`, SK: burstKey(route, window) },
      UpdateExpression: "ADD #c :one SET #t = :ttl",
      ExpressionAttributeNames: { "#c": "count", "#t": "ttl" },
      ExpressionAttributeValues: { ":one": 1, ":ttl": ttl },
      ReturnValues: "ALL_NEW",
    }),
  );
  const count = Number((res.Attributes as { count?: number } | undefined)?.count ?? 0);
  return burstAllowed(count, limitPerMinute);
}
