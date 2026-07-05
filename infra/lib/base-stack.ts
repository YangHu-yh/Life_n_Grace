import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as iam from "aws-cdk-lib/aws-iam";
import * as rds from "aws-cdk-lib/aws-rds";
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

const GITHUB_REPO = "YangHu-yh/Life_n_Grace";

export class LifeNGraceBaseStack extends cdk.Stack {
  readonly vpc: ec2.Vpc;
  readonly repository: ecr.Repository;
  readonly dbInstance: rds.DatabaseInstance;
  readonly dbSecurityGroup: ec2.SecurityGroup;
  readonly lambdaSecurityGroup: ec2.SecurityGroup;
  readonly appSecrets: secretsmanager.Secret;

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ── VPC — demo tier: no NAT gateway (Lambda has no outbound internet
    // until the Apologist key needs it; see aws-cicd-spec §0) ─────────────
    this.vpc = new ec2.Vpc(this, "Vpc", {
      maxAzs: 2,
      natGateways: 0,
      subnetConfiguration: [
        { name: "Public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
        { name: "App", subnetType: ec2.SubnetType.PRIVATE_ISOLATED, cidrMask: 24 }
      ]
    });

    // ── ECR ───────────────────────────────────────────────────────────────
    this.repository = new ecr.Repository(this, "AppRepo", {
      repositoryName: "life-n-grace",
      imageScanOnPush: true,
      removalPolicy: cdk.RemovalPolicy.RETAIN,
      lifecycleRules: [{ maxImageCount: 10 }]
    });

    // ── RDS — single db.t4g.micro hosting BOTH databases (demo tier).
    // Public subnet + publiclyAccessible so CI can run schema pushes via a
    // transient security-group rule; the SG otherwise only admits Lambda.
    // Journal content is AES-256-GCM encrypted at the application layer. ──
    this.dbSecurityGroup = new ec2.SecurityGroup(this, "DbSg", {
      vpc: this.vpc,
      description: "life-n-grace RDS - Lambda + transient CI ingress only",
      allowAllOutbound: false
    });

    this.lambdaSecurityGroup = new ec2.SecurityGroup(this, "LambdaSg", {
      vpc: this.vpc,
      description: "life-n-grace Lambda",
      allowAllOutbound: true
    });

    this.dbSecurityGroup.addIngressRule(
      this.lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      "Lambda app access"
    );

    this.dbInstance = new rds.DatabaseInstance(this, "Db", {
      engine: rds.DatabaseInstanceEngine.postgres({
        version: rds.PostgresEngineVersion.VER_16
      }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T4G, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromGeneratedSecret("lifeuser", {
        excludeCharacters: " %+~`#$&*()|[]{}:;<>?!'/@\"\\"
      }),
      vpc: this.vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PUBLIC },
      publiclyAccessible: true,
      securityGroups: [this.dbSecurityGroup],
      databaseName: "life_n_grace_main",
      allocatedStorage: 20,
      multiAz: false,
      storageEncrypted: true,
      deletionProtection: false,
      backupRetention: cdk.Duration.days(7),
      removalPolicy: cdk.RemovalPolicy.SNAPSHOT
    });

    // ── App secrets — populate real values post-deploy (see infra/README).
    // lib/env.ts hard-fails on these placeholders, so the app cannot start
    // with them: populating the secret then `cdk deploy LifeNGraceApp` is a
    // mandatory step. ─────────────────────────────────────────────────────
    this.appSecrets = new secretsmanager.Secret(this, "AppSecrets", {
      secretName: "life-n-grace/app",
      secretObjectValue: {
        AUTH_JWT_SECRET: cdk.SecretValue.unsafePlainText("replace-with-strong-random-string"),
        JOURNAL_ENCRYPTION_KEY: cdk.SecretValue.unsafePlainText("32-byte-hex-key")
      }
    });

    // ── GitHub Actions OIDC — keyless deploys ─────────────────────────────
    const createProvider = this.node.tryGetContext("createOidcProvider") !== false;
    const providerArn = `arn:aws:iam::${this.account}:oidc-provider/token.actions.githubusercontent.com`;
    const provider = createProvider
      ? new iam.OpenIdConnectProvider(this, "GithubOidc", {
          url: "https://token.actions.githubusercontent.com",
          clientIds: ["sts.amazonaws.com"]
        })
      : iam.OpenIdConnectProvider.fromOpenIdConnectProviderArn(this, "GithubOidc", providerArn);

    const deployRole = new iam.Role(this, "GithubDeployRole", {
      roleName: "life-n-grace-github-deploy",
      assumedBy: new iam.WebIdentityPrincipal(provider.openIdConnectProviderArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        StringLike: {
          "token.actions.githubusercontent.com:sub": `repo:${GITHUB_REPO}:*`
        }
      }),
      description: "GitHub Actions: ECR push, Lambda code update, CI schema push"
    });

    this.repository.grantPullPush(deployRole);
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ecr:GetAuthorizationToken"],
        resources: ["*"]
      })
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["lambda:UpdateFunctionCode", "lambda:GetFunction", "lambda:GetFunctionConfiguration"],
        resources: [`arn:aws:lambda:${this.region}:${this.account}:function:life-n-grace-demo`]
      })
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["secretsmanager:GetSecretValue"],
        resources: [this.dbInstance.secret!.secretArn, this.appSecrets.secretArn]
      })
    );
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudformation:DescribeStacks"],
        resources: [this.stackId]
      })
    );
    // Transient CI ingress for schema pushes, scoped to the DB security group
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ec2:AuthorizeSecurityGroupIngress", "ec2:RevokeSecurityGroupIngress"],
        resources: [
          `arn:aws:ec2:${this.region}:${this.account}:security-group/${this.dbSecurityGroup.securityGroupId}`
        ]
      })
    );

    // ── Outputs consumed by the deploy workflow and the README runbook ────
    new cdk.CfnOutput(this, "EcrRepoUri", { value: this.repository.repositoryUri });
    new cdk.CfnOutput(this, "DeployRoleArn", { value: deployRole.roleArn });
    new cdk.CfnOutput(this, "DbEndpoint", { value: this.dbInstance.dbInstanceEndpointAddress });
    new cdk.CfnOutput(this, "DbSecretArn", { value: this.dbInstance.secret!.secretArn });
    new cdk.CfnOutput(this, "DbSecurityGroupId", { value: this.dbSecurityGroup.securityGroupId });
    new cdk.CfnOutput(this, "AppSecretsArn", { value: this.appSecrets.secretArn });
  }
}
