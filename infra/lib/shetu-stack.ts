import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as apprunner from "aws-cdk-lib/aws-apprunner";

/**
 * Shetu production infrastructure.
 *
 * Provisions, as code:
 *   - S3 bucket for the document Vault (encrypted, all public access blocked)
 *   - DynamoDB single table (on-demand) for profiles, docs, mentorship
 *   - ECR repository for the app image
 *   - App Runner service running that image, with:
 *       - an instance role scoped to Bedrock invoke + this bucket + this table
 *       - secrets (AUTH_SECRET, Google OAuth) injected as env vars
 *
 * Nothing is public except the App Runner HTTPS endpoint. Credentials for AWS
 * are the instance role, so no keys live in the app.
 */
export interface ShetuStackProps extends cdk.StackProps {
  /** Container image tag to deploy (defaults to "latest"). */
  readonly imageTag?: string;
  /** Bedrock model IDs passed through to the app. */
  readonly modelId?: string;
  readonly fastModelId?: string;
  /** Public URL the app is served at (for Auth.js callbacks). */
  readonly appUrl?: string;
}

export class ShetuStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ShetuStackProps = {}) {
    super(scope, id, props);

    const imageTag = props.imageTag ?? "latest";
    const modelId = props.modelId ?? "us.anthropic.claude-sonnet-4-6";
    const fastModelId = props.fastModelId ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";

    // --- Vault bucket -----------------------------------------------------
    const vaultBucket = new s3.Bucket(this, "VaultBucket", {
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: true,
      // CORS so the browser can PUT/GET via presigned URLs.
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.GET],
          allowedOrigins: props.appUrl ? [props.appUrl] : ["*"],
          allowedHeaders: ["*"],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [{ abortIncompleteMultipartUploadAfter: cdk.Duration.days(7) }],
      removalPolicy: cdk.RemovalPolicy.RETAIN, // never auto-delete student documents
    });

    // --- DynamoDB single table -------------------------------------------
    const table = new dynamodb.Table(this, "AppTable", {
      partitionKey: { name: "PK", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "SK", type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // --- ECR repository for the app image --------------------------------
    const repo = new ecr.Repository(this, "AppRepo", {
      imageScanOnPush: true,
      lifecycleRules: [{ maxImageCount: 10 }],
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    });

    // --- App Runner instance role (what the running app can do) ----------
    const instanceRole = new iam.Role(this, "AppInstanceRole", {
      assumedBy: new iam.ServicePrincipal("tasks.apprunner.amazonaws.com"),
      description: "Runtime role for the Shetu App Runner service",
    });
    vaultBucket.grantReadWrite(instanceRole);
    table.grantReadWriteData(instanceRole);
    // Scope Bedrock to invoke only (both regional and cross-region profiles).
    instanceRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          `arn:aws:bedrock:*::foundation-model/*`,
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
        ],
      }),
    );

    // --- App Runner access role (to pull from ECR) -----------------------
    const accessRole = new iam.Role(this, "AppAccessRole", {
      assumedBy: new iam.ServicePrincipal("build.apprunner.amazonaws.com"),
    });
    repo.grantPull(accessRole);

    // --- Secrets -----------------------------------------------------------
    // AUTH_SECRET and Google OAuth values are provided at deploy time via CDK
    // context (so they are not committed). For a hardened setup, move these to
    // AWS Secrets Manager and reference them here instead.
    const authSecret = this.node.tryGetContext("authSecret") ?? "";
    const googleId = this.node.tryGetContext("googleId") ?? "";
    const googleSecret = this.node.tryGetContext("googleSecret") ?? "";
    const appUrl = props.appUrl ?? this.node.tryGetContext("appUrl") ?? "";

    // --- App Runner service ----------------------------------------------
    const service = new apprunner.CfnService(this, "AppService", {
      serviceName: "shetu",
      sourceConfiguration: {
        autoDeploymentsEnabled: true,
        authenticationConfiguration: { accessRoleArn: accessRole.roleArn },
        imageRepository: {
          imageIdentifier: `${repo.repositoryUri}:${imageTag}`,
          imageRepositoryType: "ECR",
          imageConfiguration: {
            port: "3000",
            runtimeEnvironmentVariables: [
              { name: "AWS_REGION", value: this.region },
              { name: "SHETU_MODEL_ID", value: modelId },
              { name: "SHETU_FAST_MODEL_ID", value: fastModelId },
              { name: "SHETU_VAULT_BUCKET", value: vaultBucket.bucketName },
              { name: "SHETU_TABLE_NAME", value: table.tableName },
              { name: "AUTH_URL", value: appUrl },
              { name: "AUTH_TRUST_HOST", value: "true" },
              { name: "AUTH_SECRET", value: authSecret },
              { name: "AUTH_GOOGLE_ID", value: googleId },
              { name: "AUTH_GOOGLE_SECRET", value: googleSecret },
            ],
          },
        },
      },
      instanceConfiguration: {
        cpu: "1 vCPU",
        memory: "2 GB",
        instanceRoleArn: instanceRole.roleArn,
      },
      healthCheckConfiguration: {
        protocol: "TCP",
        interval: 10,
        timeout: 5,
        healthyThreshold: 1,
        unhealthyThreshold: 5,
      },
    });

    // --- Outputs ----------------------------------------------------------
    new cdk.CfnOutput(this, "EcrRepositoryUri", { value: repo.repositoryUri });
    new cdk.CfnOutput(this, "AppRunnerServiceUrl", {
      value: `https://${service.attrServiceUrl}`,
      description: "Point the Cloudflare CNAME for shetu.mol.la at this host.",
    });
    new cdk.CfnOutput(this, "VaultBucketName", { value: vaultBucket.bucketName });
    new cdk.CfnOutput(this, "TableName", { value: table.tableName });
  }
}
