import * as cdk from "aws-cdk-lib";
import { Construct } from "constructs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as iam from "aws-cdk-lib/aws-iam";
import * as logs from "aws-cdk-lib/aws-logs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as cw_actions from "aws-cdk-lib/aws-cloudwatch-actions";
import * as sns from "aws-cdk-lib/aws-sns";
import * as ssm from "aws-cdk-lib/aws-ssm";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import * as rds from "aws-cdk-lib/aws-rds";
import * as budgets from "aws-cdk-lib/aws-budgets";
import * as path from "path";

/**
 * Shetu production infrastructure.
 *
 * Shape: one ECS Fargate task running two containers in the same task network
 * namespace (they share localhost):
 *   - App: the Next.js server (port 3000), exposed to the internet ONLY through
 *     a Cloudflare Tunnel (the cloudflared sidecar with a token from SSM).
 *     There is no ALB: Cloudflare is the front door and the health-checked
 *     routing layer, so inbound has no public AWS endpoint at all.
 *   - Tunnel: cloudflared sidecar; the task keeps its public IP solely for
 *     outbound calls to Bedrock, S3 and DynamoDB.
 *
 * Data resources (S3 vault bucket, DynamoDB table) are created and configured
 * outside this stack and referenced by name, so they are stable and
 * independent of stack replacement. All secrets are read from SSM
 * SecureString parameters at task start, so no secret ever sits in a task
 * definition, a context flag, or source control.
 *
 * Reliability guards provisioned here:
 *   - ECS auto-replacement of unhealthy tasks (container health check)
 *   - Target-tracking autoscaling (CPU) min 1 / max 4
 *   - CloudWatch alarms -> SNS email (task count, memory, errors, daily tokens)
 *   - AWS Budgets alert on the monthly bill
 *
 * Cost choices:
 *   - Public-subnet-only VPC, no NAT gateway
 *   - Minimum Fargate size (0.25 vCPU / 0.5 GB) with memory and CPU alarms;
 *     resize by changing two numbers if utilization shows pressure
 *   - No ALB (removed in favour of the tunnel)
 */
export interface ShetuStackProps extends cdk.StackProps {
  readonly modelId?: string;
  readonly fastModelId?: string;
  /** Public URL the app is served at (for Auth.js callbacks). */
  readonly appUrl?: string;
  /** Email for alarm and budget notifications. Subscription is skipped if empty. */
  readonly alarmEmail?: string;
}

export class ShetuStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: ShetuStackProps = {}) {
    super(scope, id, props);

    // Amazon Nova Pro / Nova 2 Lite: first-party models billed under the
    // generic "Amazon Bedrock" service row, which the account's credits
    // cover. Rollback to Claude = change these two defaults.
    const modelId = props.modelId ?? "us.amazon.nova-pro-v1:0";
    const fastModelId = props.fastModelId ?? "us.amazon.nova-2-lite-v1:0";
    const alarmEmail = props.alarmEmail ?? (this.node.tryGetContext("alarmEmail") as string | undefined) ?? "";
    const appUrl = props.appUrl ?? (this.node.tryGetContext("appUrl") as string | undefined) ?? "";

    const vaultBucketName =
      (this.node.tryGetContext("vaultBucket") as string | undefined) ?? "shetu-vault";
    const tableName =
      (this.node.tryGetContext("tableName") as string | undefined) ?? "shetu-app";
    const dailyChatLimit =
      Number(this.node.tryGetContext("dailyChatLimit")) > 0
        ? Math.floor(Number(this.node.tryGetContext("dailyChatLimit")))
        : 30;
    /** Daily token-sum alarm threshold (all models, dimension Route=chat). */
    const dailyTokenBudget =
      Number(this.node.tryGetContext("dailyTokenBudget")) > 0
        ? Math.floor(Number(this.node.tryGetContext("dailyTokenBudget")))
        : 3_000_000;
    /** Monthly spend budget in USD. */
    const monthlyBudget =
      Number(this.node.tryGetContext("monthlyBudget")) > 0
        ? Math.floor(Number(this.node.tryGetContext("monthlyBudget")))
        : 75;

    // --- SSM parameters (SecureString; values are stored once, out of band) -
    const secretsBase = "/shetu/prod";
    const tunnelTokenName = `${secretsBase}/cloudflared-token`;
    const authSecretName = `${secretsBase}/auth-secret`;
    const googleIdName = `${secretsBase}/google-id`;
    const googleSecretName = `${secretsBase}/google-secret`;

    const ssmParamArn = (name: string): string =>
      `arn:aws:ssm:${this.region}:${this.account}:parameter${name.replace(/\//g, "/")}`;

    const secureParam = (id: string, parameterName: string): ssm.IParameter =>
      ssm.StringParameter.fromSecureStringParameterAttributes(this, id, { parameterName });

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

    // Bedrock: invoke only the exact models this deployment is configured for
    // (least privilege, instead of every foundation model in every region).
    // Cross-region profile ids (us.*/eu.*/apac.*...) need BOTH the inference
    // profile ARN and the underlying foundation-model ARN: Bedrock evaluates
    // IAM against the destination foundation model (observed live:
    // AccessDenied on foundation-model/anthropic.claude-sonnet-4-6 when only
    // the profile ARN was allowed), and routing can hop regions, so the
    // foundation model is allowed in any region. Bare model ids address the
    // foundation model directly (no account in that ARN).
    const bedrockArnsFor = (id: string): string[] => {
      const profileMatch = /^(us|eu|apac|jp|au)\.(.+)$/.exec(id);
      if (profileMatch) {
        return [
          `arn:aws:bedrock:${this.region}:${this.account}:inference-profile/${id}`,
          `arn:aws:bedrock:*::foundation-model/${profileMatch[2]}`,
        ];
      }
      return [`arn:aws:bedrock:${this.region}::foundation-model/${id}`];
    };
    taskRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
        resources: [
          ...bedrockArnsFor(modelId),
          ...bedrockArnsFor(fastModelId),
          // Query embeddings for hybrid programme retrieval (retrieval
          // component, not a second answering model).
          ...bedrockArnsFor("amazon.titan-embed-text-v2:0"),
        ],
      }),
    );

    // --- Programme database (Postgres + pgvector + FTS) -------------------
    // The structured catalogue lives here once the bundled-JSON approach
    // outgrows itself (30+ countries target). Placed in the public subnets
    // with PubliclyAccessible=false: reachable from tasks over the local VPC
    // route, never from the internet, no NAT gateway needed (cost).
    const dbSecret = new secretsmanager.Secret(this, "DbSecret", {
      description: "Shetu Postgres master credentials",
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "shetu" }),
        generateStringKey: "password",
        excludeCharacters: "\"@/\\ ",
      },
    });
    const database = new rds.DatabaseInstance(this, "ProgrammesDb", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publiclyAccessible: false,
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      credentials: { username: "shetu", password: dbSecret.secretValueFromJson("password") },
      databaseName: "shetu",
      allocatedStorage: 20,
      storageEncrypted: true,
      deletionProtection: true,
      backupRetention: cdk.Duration.days(7),
      multiAz: false, // cost: single-AZ now; flip for HA at public release
    });
    new cdk.CfnOutput(this, "DbEndpoint", {
      value: database.dbInstanceEndpointAddress,
      description: "Postgres endpoint for the migration script (data/state or SSM for password)",
    });

    // --- Task definition: App + cloudflared sidecar ----------------------
    // Minimum viable size for cost; CPU and memory alarms watch utilization,
    // and resizing is a two-number change.
    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      cpu: 256,
      memoryLimitMiB: 512,
      taskRole,
    });

    // Health check uses node (present in the image) so no curl dependency.
    const appHealthCommand =
      "node -e \"fetch('http://localhost:3000/').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\"";

    const appContainer = taskDef.addContainer("App", {
      image: ecs.ContainerImage.fromAsset(path.join(__dirname, "..", ".."), {
        platform: cdk.aws_ecr_assets.Platform.LINUX_AMD64,
      }),
      containerName: "shetu-app",
      // ECS restarts the task when this check fails; it is the replacement
      // signal that used to come from the ALB target group.
      healthCheck: {
        command: ["CMD-SHELL", appHealthCommand],
        interval: cdk.Duration.seconds(30),
        timeout: cdk.Duration.seconds(10),
        retries: 3,
        startPeriod: cdk.Duration.seconds(60),
      },
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "shetu",
        // The /ecs/shetu log group already exists in this account (created by
        // the previous deployment, retention already one month) and is
        // referenced, not recreated: recreating it would fail with a name
        // conflict. On a brand-new account, create it once out of band.
        logGroup: logs.LogGroup.fromLogGroupName(this, "AppLogGroup", "/ecs/shetu"),
      }),
      environment: {
        AWS_REGION: this.region,
        SHETU_MODEL_ID: modelId,
        SHETU_FAST_MODEL_ID: fastModelId,
        SHETU_VAULT_BUCKET: vaultBucketName,
        SHETU_TABLE_NAME: tableName,
        SHETU_DAILY_CHAT_LIMIT: String(dailyChatLimit),
        SHETU_DB_HOST: database.dbInstanceEndpointAddress,
        SHETU_DB_PORT: "5432",
        SHETU_DB_NAME: "shetu",
        SHETU_DB_USER: "shetu",
        SHETU_SES_FROM: (this.node.tryGetContext("sesFrom") as string | undefined) ?? "",
        AUTH_URL: appUrl,
        AUTH_TRUST_HOST: "true",
        // ECS sets HOSTNAME to the task ENI IP, and Next standalone's
        // server.js binds to it, so the app would listen only on that
        // address. Pin 0.0.0.0 so localhost:3000 (health check, cloudflared)
        // is reachable inside the task network namespace.
        HOSTNAME: "0.0.0.0",
      },
      secrets: {
        AUTH_SECRET: ecs.Secret.fromSsmParameter(secureParam("AuthSecret", authSecretName)),
        AUTH_GOOGLE_ID: ecs.Secret.fromSsmParameter(secureParam("GoogleId", googleIdName)),
        AUTH_GOOGLE_SECRET: ecs.Secret.fromSsmParameter(secureParam("GoogleSecret", googleSecretName)),
        SHETU_DB_PASSWORD: ecs.Secret.fromSecretsManager(dbSecret, "password"),
      },
    });
    appContainer.addPortMappings({ containerPort: 3000 });

    // Cloudflare Tunnel sidecar. All ingress flows through Cloudflare; the
    // task has no public inbound endpoint. TUNNEL_TOKEN is read at task start
    // from SSM (cloudflared accepts it via the TUNNEL_TOKEN env var).
    taskDef.addContainer("Tunnel", {
      // Pin a specific cloudflared tag once the deployment is verified;
      // "latest" keeps the first bring-up simple.
      image: ecs.ContainerImage.fromRegistry("cloudflare/cloudflared:latest"),
      containerName: "cloudflared",
      command: ["tunnel", "--no-autoupdate", "run"],
      memoryLimitMiB: 64,
      logging: ecs.LogDrivers.awsLogs({
        streamPrefix: "shetu-tunnel",
        logGroup: logs.LogGroup.fromLogGroupName(this, "TunnelLogGroup", "/ecs/shetu"),
      }),
      secrets: {
        TUNNEL_TOKEN: ecs.Secret.fromSsmParameter(secureParam("TunnelToken", tunnelTokenName)),
      },
    });

    // Execution role: resolve SSM SecureString parameters at task start.
    taskDef.addToExecutionRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameters"],
        resources: [
          ssmParamArn(authSecretName),
          ssmParamArn(googleIdName),
          ssmParamArn(googleSecretName),
          ssmParamArn(tunnelTokenName),
        ],
      }),
    );
    // AWS-managed aws/ssm key decrypt, scoped to SSM as the calling service.
    taskDef.addToExecutionRolePolicy(
      new iam.PolicyStatement({
        actions: ["kms:Decrypt"],
        resources: ["*"],
        conditions: {
          StringEquals: { "kms:ViaService": `ssm.${this.region}.amazonaws.com` },
        },
      }),
    );

    // --- Fargate service (no load balancer) ------------------------------
    const service = new ecs.FargateService(this, "Service", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 1,
      // Task runs in public subnets with a public IP so it can reach AWS APIs
      // (Bedrock, S3, DynamoDB) without a NAT gateway. Inbound is blocked by
      // the default security group; ingress arrives only via the tunnel.
      assignPublicIp: true,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      // Give the app time to boot before ECS counts health-check failures.
      healthCheckGracePeriod: cdk.Duration.seconds(90),
      // Roll back automatically if a deployment goes unhealthy.
      circuitBreaker: { rollback: true },
      // Zero-downtime deploys even with one task: start the new task before
      // stopping the old one.
      minHealthyPercent: 100,
      maxHealthyPercent: 200,
    });

    // Autoscaling: cheap elasticity without an ALB request-count signal.
    const scaling = service.autoScaleTaskCount({ minCapacity: 1, maxCapacity: 4 });
    scaling.scaleOnCpuUtilization("CpuScaling", {
      targetUtilizationPercent: 60,
      scaleInCooldown: cdk.Duration.seconds(300),
      scaleOutCooldown: cdk.Duration.seconds(60),
    });

    // Tasks reach the database over the VPC local route only.
    database.connections.allowDefaultPortFrom(service.connections);

    // --- Alarms: one SNS topic, email subscription when an address exists -
    const alarmTopic = new sns.Topic(this, "AlarmTopic", {
      displayName: "Shetu alarms",
    });
    if (alarmEmail) {
      new sns.Subscription(this, "AlarmEmail", {
        topic: alarmTopic,
        protocol: sns.SubscriptionProtocol.EMAIL,
        endpoint: alarmEmail,
      });
    } else {
      this.templateOptions.description =
        (this.templateOptions.description ?? "") +
        " NOTE: no alarmEmail context provided; create an email subscription on the AlarmTopic output.";
    }

    const alarm = (
      id: string,
      metric: cloudwatch.Metric,
      props: { threshold: number; evaluationPeriods: number; period?: cdk.Duration; statistic?: string; comparison?: cloudwatch.ComparisonOperator },
    ): cloudwatch.Alarm => {
      // Period and statistic belong to the metric, not the alarm.
      const m = metric.with({
        period: props.period ?? cdk.Duration.minutes(5),
        statistic: (props.statistic ?? "Average") as cloudwatch.Statistic,
      });
      const a = new cloudwatch.Alarm(this, id, {
        metric: m,
        threshold: props.threshold,
        evaluationPeriods: props.evaluationPeriods,
        comparisonOperator: props.comparison ?? cloudwatch.ComparisonOperator.LESS_THAN_THRESHOLD,
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
        alarmDescription: "Shetu operational alarm",
      });
      a.addAlarmAction(new cw_actions.SnsAction(alarmTopic));
      return a;
    };

    // Task died and did not come back: the tunnel has nothing to route to.
    alarm("NoRunningTasks", new cloudwatch.Metric({
      namespace: "AWS/ECS",
      metricName: "RunningTaskCount",
      dimensionsMap: { ClusterName: cluster.clusterName, ServiceName: service.serviceName },
    }), {
      threshold: 1,
      evaluationPeriods: 10,
      period: cdk.Duration.minutes(1),
      statistic: "Minimum",
    });

    // Memory pressure on the 0.5 GB task: early warning before OOM kills.
    alarm("HighMemory", service.metricMemoryUtilization(), {
      threshold: 85,
      evaluationPeriods: 6,
      period: cdk.Duration.minutes(5),
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // CPU pressure (0.25 vCPU is small; scale-out exists, but say so loudly).
    alarm("HighCpu", service.metricCpuUtilization(), {
      threshold: 90,
      evaluationPeriods: 6,
      period: cdk.Duration.minutes(5),
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // Application errors from the structured logs ("level":"error" lines).
    new logs.MetricFilter(this, "ErrorMetricFilter", {
      logGroup: logs.LogGroup.fromLogGroupName(this, "AppLogGroupRef", "/ecs/shetu"),
      filterPattern: logs.FilterPattern.stringValue("$.level", "=", "error"),
      metricNamespace: "Shetu",
      metricName: "ErrorCount",
      metricValue: "1",
      defaultValue: 0,
    });
    alarm("AppErrors", new cloudwatch.Metric({
      namespace: "Shetu",
      metricName: "ErrorCount",
      dimensionsMap: {},
    }), {
      threshold: 5,
      evaluationPeriods: 3,
      period: cdk.Duration.minutes(5),
      statistic: "Sum",
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
    });

    // Daily token spend (EMF from the chat route), a soft cost guardrail.
    alarm("DailyTokens", new cloudwatch.Metric({
      namespace: "Shetu",
      metricName: "TotalTokens",
      dimensionsMap: { Route: "chat" },
    }), {
      threshold: dailyTokenBudget,
      evaluationPeriods: 1,
      period: cdk.Duration.hours(24),
      statistic: "Sum",
      comparison: cloudwatch.ComparisonOperator.GREATER_THAN_THRESHOLD,
    });

    // --- Monthly budget ---------------------------------------------------
    // Note: AWS Budgets is a global service (us-east-1 endpoint).
    if (alarmEmail) {
      new budgets.CfnBudget(this, "MonthlyBudget", {
        budget: {
          budgetName: "shetu-monthly",
          budgetLimit: { amount: monthlyBudget, unit: "USD" },
          timeUnit: "MONTHLY",
          budgetType: "COST",
        },
        notificationsWithSubscribers: [
          {
            notification: {
              notificationType: "ACTUAL",
              comparisonOperator: "GREATER_THAN",
              threshold: 80,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [{ subscriptionType: "EMAIL", address: alarmEmail }],
          },
          {
            notification: {
              notificationType: "FORECASTED",
              comparisonOperator: "GREATER_THAN",
              threshold: 100,
              thresholdType: "PERCENTAGE",
            },
            subscribers: [{ subscriptionType: "EMAIL", address: alarmEmail }],
          },
        ],
      });
    }

    // --- Outputs ----------------------------------------------------------
    new cdk.CfnOutput(this, "AlarmTopicArn", { value: alarmTopic.topicArn });
    new cdk.CfnOutput(this, "LogGroupName", { value: "/ecs/shetu" });
    new cdk.CfnOutput(this, "TunnelTokenParameter", { value: tunnelTokenName });
    new cdk.CfnOutput(this, "VaultBucketName", { value: vaultBucketName });
    new cdk.CfnOutput(this, "TableName", { value: tableName });
  }
}
