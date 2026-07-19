import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import { LifeNGraceBaseStack } from "./base-stack";

interface AppStackProps extends cdk.StackProps {
  base: LifeNGraceBaseStack;
}

// Lambda Function URLs can't be referenced from the same function's own
// environment (the URL doesn't exist until after the function is created —
// a circular CloudFormation dependency), so this is hardcoded rather than
// derived from the `fnUrl` construct below. If the Lambda/stack is ever
// recreated, update this constant and redeploy (see infra/README.md's
// standing note on Function URL stability / the custom-domain follow-up).
const APP_BASE_URL = "https://v6flaqacud5cunfhg34hiqtkci0zpbpn.lambda-url.us-east-1.on.aws";

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
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
      securityGroups: [base.lambdaSecurityGroup],
      logRetention: logs.RetentionDays.ONE_MONTH,
      environment: {
        NODE_ENV: "production",
        APP_BASE_URL,
        MAIN_DATABASE_URL: `postgresql://lifeuser:${dbPassword}@${dbHost}:5432/life_n_grace_main`,
        JOURNAL_DATABASE_URL: `postgresql://lifeuser:${dbPassword}@${dbHost}:5432/life_n_grace_journal`,
        AUTH_JWT_SECRET: base.appSecrets.secretValueFromJson("AUTH_JWT_SECRET").unsafeUnwrap(),
        JOURNAL_ENCRYPTION_KEY: base.appSecrets
          .secretValueFromJson("JOURNAL_ENCRYPTION_KEY")
          .unsafeUnwrap(),
        APOLOGIST_API_KEY: base.appSecrets.secretValueFromJson("APOLOGIST_API_KEY").unsafeUnwrap(),
        APOLOGIST_API_URL: base.appSecrets.secretValueFromJson("APOLOGIST_API_URL").unsafeUnwrap(),
        APOLOGIST_TRANSLATION: "esv",
        // Add GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to the life-n-grace/app
        // secret BEFORE the next `cdk deploy` — secretValueFromJson fails at
        // deploy time if the JSON key is missing.
        GOOGLE_CLIENT_ID: base.appSecrets.secretValueFromJson("GOOGLE_CLIENT_ID").unsafeUnwrap(),
        GOOGLE_CLIENT_SECRET: base.appSecrets
          .secretValueFromJson("GOOGLE_CLIENT_SECRET")
          .unsafeUnwrap(),
        // Add REMINDER_CRON_SECRET to the life-n-grace/app secret BEFORE the
        // next deploy (same constraint as the GOOGLE_* keys above). Generate:
        // node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
        REMINDER_CRON_SECRET: base.appSecrets
          .secretValueFromJson("REMINDER_CRON_SECRET")
          .unsafeUnwrap()
      }
    });

    const fnUrl = fn.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.RESPONSE_STREAM
    });

    // Reminder delivery cron (Sprint 9 / G5): EventBridge fires the app's
    // secret-guarded run route every 15 minutes; the route computes which
    // reminders are due in each one's own timezone (lastSentAt makes reruns
    // idempotent, so the short interval is safe). The Connection sends the
    // secret as the Authorization header value straight from Secrets Manager
    // — never plaintext in the template.
    const reminderConnection = new events.Connection(this, "ReminderCronConnection", {
      authorization: events.Authorization.apiKey(
        "Authorization",
        base.appSecrets.secretValueFromJson("REMINDER_CRON_SECRET")
      )
    });
    const reminderDestination = new events.ApiDestination(this, "ReminderCronDestination", {
      connection: reminderConnection,
      endpoint: `${APP_BASE_URL}/api/internal/reminders/run`,
      httpMethod: events.HttpMethod.POST
    });
    new events.Rule(this, "ReminderCronRule", {
      schedule: events.Schedule.rate(cdk.Duration.minutes(15)),
      targets: [new targets.ApiDestination(reminderDestination)]
    });

    new cdk.CfnOutput(this, "FunctionName", { value: fn.functionName });
    new cdk.CfnOutput(this, "FunctionUrl", { value: fnUrl.url });
  }
}
