import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { LifeNGraceBaseStack } from "./base-stack";

interface AppStackProps extends cdk.StackProps {
  base: LifeNGraceBaseStack;
}

export class LifeNGraceAppStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AppStackProps) {
    super(scope, id, props);
    const { base } = props;

    const dbSecret = base.dbInstance.secret!;
    const dbHost = base.dbInstance.dbInstanceEndpointAddress;
    // Values resolve as CloudFormation dynamic references at deploy time —
    // never plaintext in the template. Re-run `cdk deploy LifeNGraceApp`
    // after changing secret values so the environment picks them up.
    const dbPassword = dbSecret.secretValueFromJson("password").unsafeUnwrap();

    const fn = new lambda.DockerImageFunction(this, "AppFn", {
      functionName: "life-n-grace-demo",
      code: lambda.DockerImageCode.fromEcr(base.repository, { tagOrDigest: "latest" }),
      architecture: lambda.Architecture.X86_64,
      memorySize: 1536,
      timeout: cdk.Duration.seconds(120),
      vpc: base.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [base.lambdaSecurityGroup],
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        NODE_ENV: "production",
        MAIN_DATABASE_URL: `postgresql://lifeuser:${dbPassword}@${dbHost}:5432/life_n_grace_main`,
        JOURNAL_DATABASE_URL: `postgresql://lifeuser:${dbPassword}@${dbHost}:5432/life_n_grace_journal`,
        AUTH_JWT_SECRET: base.appSecrets.secretValueFromJson("AUTH_JWT_SECRET").unsafeUnwrap(),
        JOURNAL_ENCRYPTION_KEY: base.appSecrets
          .secretValueFromJson("JOURNAL_ENCRYPTION_KEY")
          .unsafeUnwrap(),
        // APOLOGIST_* intentionally unset — companion shows its friendly
        // "not yet available" message until the key + NAT are provisioned
        // (project-plan v2.1, risk R11).
        APOLOGIST_TRANSLATION: "esv"
      }
    });

    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM
    });

    new cdk.CfnOutput(this, "FunctionName", { value: fn.functionName });
    new cdk.CfnOutput(this, "FunctionUrl", { value: fnUrl.url });
  }
}
