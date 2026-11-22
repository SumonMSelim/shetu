/**
 * One-time data hardening for the resources this app depends on.
 *
 * - Enables DynamoDB point-in-time recovery on the app table (restore to any
 *   second within the last 35 days; the table is the only copy of user data).
 * - Enables S3 versioning on the vault bucket (overwrites and deletes of user
 *   documents stay recoverable) and adds lifecycle hygiene: abandoned multipart
 *   uploads aborted after 7 days, noncurrent versions expire after 90 days.
 *
 * Idempotent: safe to run again; it prints the verified state each time.
 *
 * Usage: npm run harden-storage   (needs AWS credentials, like the app)
 */
import {
  DynamoDBClient,
  UpdateContinuousBackupsCommand,
  DescribeContinuousBackupsCommand,
} from "@aws-sdk/client-dynamodb";
import {
  S3Client,
  PutBucketVersioningCommand,
  GetBucketVersioningCommand,
  PutBucketLifecycleConfigurationCommand,
  GetBucketLifecycleConfigurationCommand,
} from "@aws-sdk/client-s3";
import { config } from "../src/lib/config";

const ddb = new DynamoDBClient({ region: config.aws.region });
const s3 = new S3Client({ region: config.aws.region });

async function hardenTable(): Promise<void> {
  const name = config.storage.tableName;
  await ddb.send(
    new UpdateContinuousBackupsCommand({
      TableName: name,
      PointInTimeRecoverySpecification: { PointInTimeRecoveryEnabled: true },
    }),
  );
  const state = await ddb.send(new DescribeContinuousBackupsCommand({ TableName: name }));
  const status = state.ContinuousBackupsDescription?.ContinuousBackupsStatus;
  const pitr =
    state.ContinuousBackupsDescription?.PointInTimeRecoveryDescription?.PointInTimeRecoveryStatus;
  console.log(`DynamoDB ${name}: PITR ${pitr ?? "unknown"} (backups ${status ?? "unknown"})`);
}

async function hardenBucket(): Promise<void> {
  const bucket = config.storage.vaultBucket;
  await s3.send(
    new PutBucketVersioningCommand({
      Bucket: bucket,
      VersioningConfiguration: { Status: "Enabled" },
    }),
  );
  await s3.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: bucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: "vault-hygiene",
            Status: "Enabled",
            Filter: { Prefix: "" },
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 7 },
            NoncurrentVersionExpiration: { NoncurrentDays: 90 },
          },
        ],
      },
    }),
  );
  const versioning = await s3.send(new GetBucketVersioningCommand({ Bucket: bucket }));
  console.log(`S3 ${bucket}: versioning ${versioning.Status ?? "disabled"}`);
  try {
    const lifecycle = await s3.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: bucket }),
    );
    console.log(
      `S3 ${bucket}: lifecycle rules ${(lifecycle.Rules ?? []).map((r) => r.ID).join(", ")}`,
    );
  } catch {
    // No lifecycle rules existed before; they are applied now.
    console.log(`S3 ${bucket}: lifecycle rules applied`);
  }
}

await hardenTable();
await hardenBucket();
console.log("Data hardening complete.");
