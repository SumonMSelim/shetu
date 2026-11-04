import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as path from "path";

/**
 * Shetu production infrastructure.
 *
 * Provisions, as code:
 *   - A VPC (public subnets only, no NAT) to keep cost down
 *   - An ECS Fargate service behind an Application Load Balancer, running the
 *     container with a task role scoped to Bedrock invoke + the existing S3
 *     bucket and DynamoDB table
 *   - The container image is built from the repo's Dockerfile at deploy time
 *     (CDK handles the build and push to ECR automatically)
 *   - Secrets (AUTH_SECRET, Google OAuth) injected as container env vars
 *
 * The S3 Vault bucket and DynamoDB table are created and configured outside
 * this stack and referenced by name, so data resources are stable and
 * independent of stack replacement.
 *
 * ECS Fargate is used instead of App Runner because App Runner service
 * creation is restricted on this account. Fargate supports streaming responses
 * (which the chat endpoint needs) and runs the same Docker image.
 */
export interface ShetuStackProps extends cdk.StackProps {
  readonly modelId?: string;
  readonly fastModelId?: string;
  /** Public URL the app is served at (for Auth.js callbacks). */
  readonly appUrl?: string;
}

export class ShetuStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ShetuStackProps = {}) {
    super(scope, id, props);

    const modelId = props.modelId ?? "us.anthropic.claude-sonnet-4-6";
    const fastModelId = props.fastModelId ?? "us.anthropic.claude-haiku-4-5-20251001-v1:0";

    const vaultBucketName =
      (this.node.tryGetContext("vaultBucket") as string | undefined) ?? "shetu-vault";
    const tableName =
      (this.node.tryGetContext("tableName") as string | undefined) ?? "shetu-app";
    const appUrl = props.appUrl ?? (this.node.tryGetContext("appUrl") as string | undefined) ?? "";

    // Secrets supplied at deploy time via context (never committed).
    const authSecret = (this.node.tryGetContext("authSecret") as string | undefined) ?? "";
    const googleId = (this.node.tryGetContext("googleId") as string | undefined) ?? "";
    const googleSecret = (this.node.tryGetContext("googleSecret") as string | undefined) ?? "";

    // ACM certificate for HTTPS on the ALB (end-to-end TLS with Cloudflare
    // Full (Strict)). When provided, the ALB serves HTTPS on 443 and redirects
    // HTTP to HTTPS. When absent, the ALB serves plain HTTP (initial bring-up).
    const certArn = (this.node.tryGetContext("certArn") as string | undefined) ?? "";

    // --- Existing data resources (referenced by name) --------------------
    const vaultBucket = s3.Bucket.fromBucketName(this, "VaultBucket", vaultBucketName);
    const table = dynamodb.Table.fromTableName(this, "AppTable", tableName);

    // --- Network: public-subnet-only VPC (no NAT, to avoid NAT cost) -----
    const vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
      ],
    });

    const cluster = new ecs.Cluster(this, "Cluster", { vpc });

    // --- Task role (what the running container can do) -------------------
    const taskRole = new iam.Role(this, "TaskRole", {
      assumedBy: new iam.ServicePrincipal("ecs-tasks.amazonaws.com"),
      description: "Runtime role for the Shetu Fargate task",
    });
    vaultBucket.grantReadWrite(taskRole);
    table.grantReadWriteData(taskRole);
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          "arn:aws:bedrock:*::foundation-model/*",
          `arn:aws:bedrock:*:${this.account}:inference-profile/*`,
        ],
      }),
    );

    // --- Fargate service behind an ALB -----------------------------------
    const certificate = certArn
      ? acm.Certificate.fromCertificateArn(this, "Cert", certArn)
      : undefined;

    const service = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Service", {
      cluster,
      cpu: 512,
      memoryLimitMiB: 1024,
      desiredCount: 1,
      publicLoadBalancer: true,
      // Task runs in public subnets with a public IP so it can reach AWS APIs
      // (Bedrock, S3, DynamoDB) without a NAT gateway.
      assignPublicIp: true,
      taskSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      // When a certificate is provided, serve HTTPS on 443 and redirect HTTP.
      ...(certificate
        ? {
            protocol: elbv2.ApplicationProtocol.HTTPS,
            certificate,
            redirectHTTP: true,
            sslPolicy: elbv2.SslPolicy.RECOMMENDED_TLS,
          }
        : {}),
      taskImageOptions: {
        // Build the image from the repo root Dockerfile at deploy time.
        image: ecs.ContainerImage.fromAsset(path.join(__dirname, "..", ".."), {
          platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64,
        }),
        containerPort: 3000,
        taskRole,
        enableLogging: true,
        logDriver: ecs.LogDrivers.awsLogs({
          streamPrefix: "shetu",
          logRetention: logs.RetentionDays.ONE_MONTH,
        }),
        environment: {
          AWS_REGION: this.region,
          SHETU_MODEL_ID: modelId,
          SHETU_FAST_MODEL_ID: fastModelId,
          SHETU_VAULT_BUCKET: vaultBucketName,
          SHETU_TABLE_NAME: tableName,
          AUTH_URL: appUrl,
          AUTH_TRUST_HOST: "true",
          AUTH_SECRET: authSecret,
          AUTH_GOOGLE_ID: googleId,
          AUTH_GOOGLE_SECRET: googleSecret,
        },
      },
    });

    // Health check: Next.js serves the landing page at "/" with a 200.
    service.targetGroup.configureHealthCheck({
      path: "/",
      healthyHttpCodes: "200-399",
      interval: cdk.Duration.seconds(30),
      timeout: cdk.Duration.seconds(10),
      healthyThresholdCount: 2,
      unhealthyThresholdCount: 5,
    });
    service.targetGroup.setAttribute("deregistration_delay.timeout_seconds", "15");

    // --- Outputs ----------------------------------------------------------
    new cdk.CfnOutput(this, "LoadBalancerUrl", {
      value: `${certArn ? "https" : "http"}://${service.loadBalancer.loadBalancerDnsName}`,
      description: "The ALB host. shetu.mol.la is a Cloudflare CNAME to this.",
    });
    new cdk.CfnOutput(this, "VaultBucketName", { value: vaultBucketName });
    new cdk.CfnOutput(this, "TableName", { value: tableName });
  }
}

