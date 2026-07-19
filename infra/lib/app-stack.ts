import * as cdk from "aws-cdk-lib";
import * as acm from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53targets from "aws-cdk-lib/aws-route53-targets";
import { Construct } from "constructs";
import { LifeNGraceBaseStack } from "./base-stack";

interface AppStackProps extends cdk.StackProps {
  base: LifeNGraceBaseStack;
}

// Lambda Function URLs can't be referenced from the same function's own
// environment (the URL doesn't exist until after the function is created —
// a circular CloudFormation dependency; the same cycle bars referencing the
// CloudFront distribution below), so this is hardcoded rather than derived
// from a construct. After the first deploy that creates the CloudFront
// distribution (Sprint 8 / G3), switch this to the DistributionDomain output
// (or the custom domain, if configured) and redeploy — then redirects and
// reminder-cron calls flow through the stable entry point instead of the
// fragile Function URL.
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
          .unsafeUnwrap(),
        // Email sender config — all six keys must EXIST in the secret before
        // deploy (secretValueFromJson fails on missing keys), but empty-string
        // values are fine and mean "email off". Temp-Gmail testing: set
        // EMAIL_FROM to the Gmail address, SMTP_HOST=smtp.gmail.com,
        // SMTP_PORT=587, SMTP_USER=the address, SMTP_PASS=an app password.
        // Formal address later: change these secret values only — no code.
        // See DEPLOYMENT.md "Changing the sender email".
        EMAIL_PROVIDER: base.appSecrets.secretValueFromJson("EMAIL_PROVIDER").unsafeUnwrap(),
        EMAIL_FROM: base.appSecrets.secretValueFromJson("EMAIL_FROM").unsafeUnwrap(),
        SMTP_HOST: base.appSecrets.secretValueFromJson("SMTP_HOST").unsafeUnwrap(),
        SMTP_PORT: base.appSecrets.secretValueFromJson("SMTP_PORT").unsafeUnwrap(),
        SMTP_USER: base.appSecrets.secretValueFromJson("SMTP_USER").unsafeUnwrap(),
        SMTP_PASS: base.appSecrets.secretValueFromJson("SMTP_PASS").unsafeUnwrap()
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

    // ---------------------------------------------------------------------
    // Stable public entry point (Sprint 8 / G3, kills risk R12).
    //
    // CloudFront in front of the Function URL: the distribution's
    // *.cloudfront.net domain survives a Lambda/stack recreation (only the
    // origin changes), so the Google OAuth redirect URI and the mobile apps'
    // baked-in base URL stop depending on the fragile Function URL.
    //
    // Optionally attach a real custom domain by passing CDK context:
    //   cdk deploy -c customDomain=app.example.com \
    //              -c hostedZoneId=Z123EXAMPLE -c hostedZoneName=example.com
    // (zone must already exist in Route53; cert auto-validates via DNS —
    // this stack is us-east-1, which is exactly what CloudFront requires).
    //
    // Post-deploy checklist (either flavor):
    //   1. Set APP_BASE_URL above to the new domain and redeploy.
    //   2. Re-register the Google OAuth redirect URI against it.
    //   3. Point SES domain identity at it when email lands (Sprint 9 note).
    const customDomain = this.node.tryGetContext("customDomain") as string | undefined;
    const hostedZoneId = this.node.tryGetContext("hostedZoneId") as string | undefined;
    const hostedZoneName = this.node.tryGetContext("hostedZoneName") as string | undefined;
    const hasCustomDomain = Boolean(customDomain && hostedZoneId && hostedZoneName);

    const hostedZone = hasCustomDomain
      ? route53.HostedZone.fromHostedZoneAttributes(this, "AppZone", {
          hostedZoneId: hostedZoneId!,
          zoneName: hostedZoneName!
        })
      : undefined;
    const certificate = hasCustomDomain
      ? new acm.Certificate(this, "AppCertificate", {
          domainName: customDomain!,
          validation: acm.CertificateValidation.fromDns(hostedZone)
        })
      : undefined;

    // Fn.select(2, split("/", url)) turns "https://xyz.lambda-url..." into
    // its bare domain at deploy time.
    const fnUrlDomain = cdk.Fn.select(2, cdk.Fn.split("/", fnUrl.url));
    const distribution = new cloudfront.Distribution(this, "AppDistribution", {
      comment: "life-n-grace stable entry point in front of the Lambda Function URL",
      defaultBehavior: {
        origin: new origins.HttpOrigin(fnUrlDomain, {
          protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY
        }),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        // The app is SSR + per-user APIs — CloudFront is here for URL
        // stability (and TLS at the edge), not caching.
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        // MUST NOT forward the viewer Host header: Function URLs route by
        // their own hostname and 403 on anything else.
        originRequestPolicy: cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS
      },
      ...(hasCustomDomain ? { domainNames: [customDomain!], certificate } : {})
    });

    if (hasCustomDomain && hostedZone) {
      new route53.ARecord(this, "AppAliasRecord", {
        zone: hostedZone,
        recordName: customDomain,
        target: route53.RecordTarget.fromAlias(
          new route53targets.CloudFrontTarget(distribution)
        )
      });
    }

    new cdk.CfnOutput(this, "FunctionName", { value: fn.functionName });
    new cdk.CfnOutput(this, "FunctionUrl", { value: fnUrl.url });
    new cdk.CfnOutput(this, "DistributionDomain", {
      value: distribution.distributionDomainName
    });
    if (hasCustomDomain) {
      new cdk.CfnOutput(this, "CustomDomain", { value: customDomain! });
    }
  }
}
