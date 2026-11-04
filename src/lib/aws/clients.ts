import { S3Client } from "@aws-sdk/client-s3";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { config } from "@/lib/config";

/**
 * Shared AWS SDK clients.
 *
 * Instantiated once per server process (module singletons). Credentials come
 * from the default provider chain - the task/instance IAM role in production,
 * so no keys are ever embedded. Region is centrally configured.
 */

let _s3: S3Client | undefined;
let _ddb: DynamoDBDocumentClient | undefined;

export function s3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({ region: config.aws.region });
  }
  return _s3;
}

export function ddb(): DynamoDBDocumentClient {
  if (!_ddb) {
    const base = new DynamoDBClient({ region: config.aws.region });
    _ddb = DynamoDBDocumentClient.from(base, {
      marshallOptions: { removeUndefinedValues: true },
    });
  }
  return _ddb;
}
