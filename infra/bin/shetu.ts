#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ShetuStack } from "../lib/shetu-stack";

/**
 * CDK entry point.
 *
 * Secrets live in SSM SecureString parameters (/shetu/prod/*, stored once out
 * of band), so the deploy command carries no secrets:
 *
 *   npx cdk deploy -c appUrl=https://shetu.mol.la -c alarmEmail=you@example.com
 */
const app = new cdk.App();

new ShetuStack(app, "ShetuStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  appUrl: app.node.tryGetContext("appUrl"),
  alarmEmail: app.node.tryGetContext("alarmEmail"),
  description: "Shetu - reliable study-abroad advisor (Strands multi-agent app)",
});
