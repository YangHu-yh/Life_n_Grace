#!/usr/bin/env node
import * as cdk from "aws-cdk-lib";
import { LifeNGraceBaseStack } from "../lib/base-stack";
import { LifeNGraceAppStack } from "../lib/app-stack";

const app = new cdk.App();

const env = {
  account: process.env.CDK_DEFAULT_ACCOUNT,
  region: process.env.CDK_DEFAULT_REGION ?? "us-east-1"
};

const base = new LifeNGraceBaseStack(app, "LifeNGraceBase", { env });
new LifeNGraceAppStack(app, "LifeNGraceApp", { env, base });
