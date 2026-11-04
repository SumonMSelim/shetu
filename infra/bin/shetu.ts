#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { ShetuStack } from "../lib/shetu-stack";

/**
 * CDK entry point.
 *
 * Deploy with context values (kept out of source control), for example:
 *
 *   npx cdk deploy \
 *     -c authSecret="$(openssl rand -base64 33)" \
 *     -c googleId=xxxx.apps.googleusercontent.com \
 *     -c googleSecret=yyyy \
 *     -c appUrl=https://shetu.mol.la \
 *     -c imageTag=latest
 */
const app = new cdk.App();

new ShetuStack(app, "ShetuStack", {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION ?? "us-east-1",
  },
  imageTag: app.node.tryGetContext("imageTag"),
  appUrl: app.node.tryGetContext("appUrl"),
  description: "Shetu - honest study-abroad advisor (Strands multi-agent app)",
});
