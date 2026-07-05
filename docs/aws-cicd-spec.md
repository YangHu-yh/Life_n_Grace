# AWS Deployment + CI/CD Spec

**Version:** 1.2  
**Date:** 2026-07-04 (v1.0: 2026-05-06)  
**Architecture pattern:** Demo/beta tier: **Lambda (container) + Function URL + RDS** · Production tier: Three-Tier (ALB + ECS Fargate + RDS)  

> **v1.2 — Compute decision (2026-07-04): Lambda for demo/beta.** ECS Fargate + ALB has no free tier (~$52/month from day one); AWS App Runner stopped accepting new customers 2026-04-30 (end of support — do not use). Lambda's always-free tier (1M requests + 400K GB-seconds/month, never expires) covers demo/beta compute entirely. The **same Docker image** is used in both tiers — only the deploy target changes at launch.

---

## 0. Demo/Beta Tier — Lambda + Function URL (ACTIVE)

```
Internet
    │
    ▼
Lambda Function URL (built-in HTTPS, response streaming enabled)
    │
    ▼
Lambda (Next.js standalone container + AWS Lambda Web Adapter)
    │  in VPC, private subnets
    ▼
RDS PostgreSQL db.t4g.micro — single instance, single-AZ,
hosting BOTH life_n_grace_main and life_n_grace_journal databases
(two connection strings preserved — security boundary intact)
```

> **Implemented in [`infra/`](../infra/README.md)** (CDK, two stacks: `LifeNGraceBase` + `LifeNGraceApp`).
> Demo-tier deviations from the diagram above: RDS sits in a **public subnet,
> security-group-locked** (only the Lambda SG, plus a transient CI rule that
> exists for the seconds the deploy job runs) so CI can apply schema changes
> without a NAT or bastion; schema sync uses `prisma db push` rather than
> committed migrations for now (migration history lands with P1-7).

**Demo-tier cost (verified 2026-07-04):**

| Service | Monthly |
|---------|---------|
| Lambda compute (demo traffic) | **$0** — inside always-free tier (1M req + 400K GB-s) |
| Lambda Function URL (HTTPS) | **$0** — no charge; no ALB, no API Gateway needed |
| RDS db.t4g.micro single-AZ ($0.016/hr) + 20GB gp3 + 7-day backups | ~$14 |
| ECR + Secrets Manager + CloudWatch | ~$2 |
| **Total** | **~$16/month** |

**How the same Dockerfile serves both tiers** — add the AWS Lambda Web Adapter (official AWS layer) to the runner stage; it is inert when the container runs on ECS:

```dockerfile
# In the runner stage (see §2) — one added line:
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.0 /lambda-adapter /opt/extensions/lambda-adapter
# Enable SSE streaming for the companion route when on Lambda:
ENV AWS_LWA_INVOKE_MODE=response_stream
```

**Demo-tier deploy step** (replaces the ECS rolling-update steps in §5 while on Lambda):

```yaml
      - name: Deploy to Lambda
        run: |
          aws lambda update-function-code \
            --function-name life-n-grace-demo \
            --image-uri $ECR_REGISTRY/$ECR_REPOSITORY:${{ github.sha }}
          aws lambda wait function-updated --function-name life-n-grace-demo
```

**Demo-tier notes:**
- **Secrets:** injected as Lambda environment variables (KMS-encrypted at rest) from Secrets Manager at deploy time — no runtime Secrets Manager calls, no VPC endpoints needed.
- **Networking staging:** Lambda sits in the VPC's private subnets to reach RDS. It has **no outbound internet** until a NAT exists — which is fine initially because `APOLOGIST_*` is unset (companion returns its "not yet available" message). **When the Apologist API key is provisioned:** add a NAT instance (t4g.nano, ~$4/month) or NAT gateway (~$32/month) so the companion can reach the Apologist endpoint.
- **Cold starts:** ~2–4s first request (container init + 2 Prisma clients). Before a partner demo, load the app once to warm it. If needed on demo day, enable provisioned concurrency (1 instance) for the hour and turn it off after.
- **Migrations:** run Prisma migrations from CI (GitHub Actions job with DB access via temporary security-group rule) or a one-off Lambda invocation — not at cold start.
- **Skip for demo/beta:** ALB, NAT (until Apologist key), CloudFront, WAF, SES, Multi-AZ, custom domain (Function URL's `*.lambda-url.us-east-1.on.aws` is fine for partners).
- **Launch = switch to production tier below:** same image, same ECR, same CI; the CDK swap is Lambda+Function URL → ECS service+ALB (§3), and RDS gains Multi-AZ + a second instance to physically separate the journal DB.

**IaC approach:** AWS CDK (TypeScript) — type-safe, integrates with existing TS codebase  
**Security framework:** ISO 27001:2022 — A.8.9 (config management), A.8.23 (web filtering), A.8.24 (cryptography)  
**Privacy framework:** GDPR Art. 32 — appropriate technical security measures

---

## 1. Architecture Overview

```
Internet
    │
    ▼
Route 53 (DNS)
    │
    ▼
ACM (TLS certificate)
    │
    ▼
CloudFront (CDN for static assets)
    │
    ├── /api/* ────────────────────────────────────┐
    │                                              ▼
    │                                  ALB (Application Load Balancer)
    │                                              │
    │                                    ECS Fargate Service
    │                                    (Next.js container × 2 tasks)
    │                                              │
    └── static/* ────── S3 (optional)    ┌────────┴───────────┐
                                         ▼                    ▼
                                  RDS PostgreSQL        RDS PostgreSQL
                                  (main DB)             (journal DB)
                                  Multi-AZ              Multi-AZ

Shared services:
  AWS Secrets Manager   — all env vars
  AWS SES               — transactional email
  ECR                   — Docker image registry
  CloudWatch Logs       — container logs
  CloudWatch Alarms     — error rate, response time
  AWS WAF               — rate limiting + OWASP Top 10 rules

GitHub Actions CI/CD pipeline:
  PR → lint, typecheck, test, security scan, docker build
  main → build + push ECR → deploy ECS rolling update
```

**Cost estimate (light production workload, 2 tasks):**

| Service | Monthly estimate |
|---------|-----------------|
| ECS Fargate (2× 0.5 vCPU, 1GB RAM) | ~$25 |
| RDS PostgreSQL db.t3.micro × 2 | ~$30 |
| ALB | ~$18 |
| CloudFront | ~$5 |
| SES (5k emails/month) | ~$0.50 |
| ECR storage | ~$1 |
| Secrets Manager | ~$1 |
| CloudWatch | ~$5 |
| **Total** | **~$85/month** |

---

## 2. Docker Setup

### `Dockerfile`

```dockerfile
# ---- Build stage ----
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run prisma:generate
RUN npm run build

# ---- Production stage ----
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder /app/generated ./generated
COPY --from=builder /app/prisma ./prisma

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
```

### `next.config.js` — enable standalone output

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
}

module.exports = nextConfig
```

### `.dockerignore`

```
node_modules
.next
.env
.env.local
.env.*.local
*.md
.git
.github
coverage
```

---

## 3. AWS CDK Infrastructure

### Install CDK

```bash
mkdir infra && cd infra
npm init -y
npm install aws-cdk-lib constructs
npm install -g aws-cdk
cdk init app --language typescript
```

### `infra/lib/life-n-grace-stack.ts`

```typescript
import * as cdk from "aws-cdk-lib"
import * as ec2 from "aws-cdk-lib/aws-ec2"
import * as ecs from "aws-cdk-lib/aws-ecs"
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns"
import * as rds from "aws-cdk-lib/aws-rds"
import * as ecr from "aws-cdk-lib/aws-ecr"
import * as secretsmanager from "aws-cdk-lib/aws-secretsmanager"
import * as ses from "aws-cdk-lib/aws-ses"
import * as logs from "aws-cdk-lib/aws-logs"
import { Construct } from "constructs"

export class LifeNGraceStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props)

    // ── VPC ──────────────────────────────────────────────────────────────
    const vpc = new ec2.Vpc(this, "VPC", {
      maxAzs: 2,
      natGateways: 1,
      subnetConfiguration: [
        { name: "Public",  subnetType: ec2.SubnetType.PUBLIC,           cidrMask: 24 },
        { name: "Private", subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS, cidrMask: 24 },
        { name: "DB",      subnetType: ec2.SubnetType.PRIVATE_ISOLATED,  cidrMask: 24 },
      ],
    })

    // ── RDS — Main DB ─────────────────────────────────────────────────────
    const mainDbSecret = new secretsmanager.Secret(this, "MainDbSecret", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "lifeuser" }),
        generateStringKey: "password",
        excludePunctuation: true,
      },
    })

    const mainDb = new rds.DatabaseInstance(this, "MainDb", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromSecret(mainDbSecret),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      databaseName: "life_n_grace_main",
      multiAz: true,
      storageEncrypted: true,   // ISO 27001 A.8.24 — encryption at rest
      deletionProtection: true,
      backupRetention: cdk.Duration.days(7),
    })

    // ── RDS — Journal DB ──────────────────────────────────────────────────
    const journalDbSecret = new secretsmanager.Secret(this, "JournalDbSecret", {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({ username: "lifeuser" }),
        generateStringKey: "password",
        excludePunctuation: true,
      },
    })

    const journalDb = new rds.DatabaseInstance(this, "JournalDb", {
      engine: rds.DatabaseInstanceEngine.postgres({ version: rds.PostgresEngineVersion.VER_16 }),
      instanceType: ec2.InstanceType.of(ec2.InstanceClass.T3, ec2.InstanceSize.MICRO),
      credentials: rds.Credentials.fromSecret(journalDbSecret),
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      databaseName: "life_n_grace_journal",
      multiAz: true,
      storageEncrypted: true,
      deletionProtection: true,
      backupRetention: cdk.Duration.days(7),
    })

    // ── Application Secrets ───────────────────────────────────────────────
    const appSecrets = new secretsmanager.Secret(this, "AppSecrets", {
      secretObjectValue: {
        AUTH_JWT_SECRET:        cdk.SecretValue.unsafePlainText("REPLACE_AFTER_DEPLOY"),
        JOURNAL_ENCRYPTION_KEY: cdk.SecretValue.unsafePlainText("REPLACE_AFTER_DEPLOY"),
        APOLOGIST_API_KEY:      cdk.SecretValue.unsafePlainText("REPLACE_AFTER_DEPLOY"),
        APOLOGIST_API_URL:      cdk.SecretValue.unsafePlainText("REPLACE_AFTER_DEPLOY"),
        // Deferred to auth sprint (project-plan v2.1 Sprint 4):
        // GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, NEXTAUTH_SECRET
      },
    })

    // ── ECR ───────────────────────────────────────────────────────────────
    const repository = new ecr.Repository(this, "AppRepo", {
      repositoryName: "life-n-grace",
      imageScanOnPush: true,    // ISO 27001 — vulnerability scanning
      removalPolicy: cdk.RemovalPolicy.RETAIN,
    })

    // ── ECS Cluster ───────────────────────────────────────────────────────
    const cluster = new ecs.Cluster(this, "Cluster", {
      vpc,
      containerInsights: true,  // CloudWatch metrics
    })

    // ── ECS Task Definition ───────────────────────────────────────────────
    const taskDef = new ecs.FargateTaskDefinition(this, "TaskDef", {
      memoryLimitMiB: 1024,
      cpu: 512,
    })

    const logGroup = new logs.LogGroup(this, "AppLogs", {
      logGroupName: "/ecs/life-n-grace",
      retention: logs.RetentionDays.THIRTY_DAYS,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    })

    const container = taskDef.addContainer("app", {
      image: ecs.ContainerImage.fromEcrRepository(repository, "latest"),
      logging: ecs.LogDrivers.awsLogs({ streamPrefix: "app", logGroup }),
      environment: {
        NODE_ENV: "production",
        AWS_REGION: this.region,
        APOLOGIST_MODEL_ID: "gpt-4o",
        APOLOGIST_TRANSLATION: "esv",
        // Deferred to auth sprint: EMAIL_PROVIDER=ses, NEXTAUTH_URL
      },
      secrets: {
        AUTH_JWT_SECRET:        ecs.Secret.fromSecretsManager(appSecrets, "AUTH_JWT_SECRET"),
        JOURNAL_ENCRYPTION_KEY: ecs.Secret.fromSecretsManager(appSecrets, "JOURNAL_ENCRYPTION_KEY"),
        APOLOGIST_API_KEY:      ecs.Secret.fromSecretsManager(appSecrets, "APOLOGIST_API_KEY"),
        APOLOGIST_API_URL:      ecs.Secret.fromSecretsManager(appSecrets, "APOLOGIST_API_URL"),
        MAIN_DATABASE_URL:      ecs.Secret.fromSecretsManager(mainDbSecret),
        JOURNAL_DATABASE_URL:   ecs.Secret.fromSecretsManager(journalDbSecret),
      },
    })

    container.addPortMappings({ containerPort: 3000 })

    // Grant ECR pull access
    repository.grantPull(taskDef.taskRole)
    // Grant Secrets Manager read
    appSecrets.grantRead(taskDef.taskRole)
    mainDbSecret.grantRead(taskDef.taskRole)
    journalDbSecret.grantRead(taskDef.taskRole)

    // ── ECS Fargate Service + ALB ─────────────────────────────────────────
    const fargateService = new ecsPatterns.ApplicationLoadBalancedFargateService(this, "Service", {
      cluster,
      taskDefinition: taskDef,
      desiredCount: 2,
      publicLoadBalancer: true,
      listenerPort: 443,
      redirectHTTP: true,   // auto HTTP→HTTPS redirect
      // certificate: acm.Certificate.fromArn(this, "Cert", "arn:aws:acm:..."),
    })

    // Allow ECS to reach RDS
    mainDb.connections.allowFrom(fargateService.service, ec2.Port.tcp(5432))
    journalDb.connections.allowFrom(fargateService.service, ec2.Port.tcp(5432))

    // Auto-scaling
    const scaling = fargateService.service.autoScaleTaskCount({ maxCapacity: 4, minCapacity: 1 })
    scaling.scaleOnCpuUtilization("CpuScaling", { targetUtilizationPercent: 70 })

    // ── Grant SES send permission ─────────────────────────────────────────
    taskDef.taskRole.addManagedPolicy(
      cdk.aws_iam.ManagedPolicy.fromAwsManagedPolicyName("AmazonSESFullAccess")  // tighten post-launch
    )

    // ── Outputs ───────────────────────────────────────────────────────────
    new cdk.CfnOutput(this, "LoadBalancerDNS", { value: fargateService.loadBalancer.loadBalancerDnsName })
    new cdk.CfnOutput(this, "ECRRepo", { value: repository.repositoryUri })
  }
}
```

### Deploy CDK

```bash
cd infra
cdk bootstrap aws://ACCOUNT_ID/us-east-1
cdk deploy
```

---

## 4. AWS SES Setup

1. Verify your sending domain in SES console (add DNS TXT + CNAME records)
2. Request production access (move out of sandbox) — submit case to AWS Support
3. Configure DKIM signing (protects deliverability)
4. Set up bounce/complaint notifications via SNS (required for deliverability health)
5. Add `EMAIL_PROVIDER=ses` and `AWS_REGION` to container environment
6. The `lib/email.ts` abstraction automatically uses SES in production

```bash
# Add SES send permission to task role (least privilege alternative)
aws iam put-role-policy \
  --role-name LifeNGraceTaskRole \
  --policy-name SESSendEmail \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [{
      "Effect": "Allow",
      "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "*",
      "Condition": {
        "StringEquals": {"ses:FromAddress": "noreply@lifengrace.com"}
      }
    }]
  }'
```

---

## 5. GitHub Actions CI/CD Pipeline

### `.github/workflows/ci.yml` — Pull Request Checks

```yaml
name: CI

on:
  pull_request:
    branches: [main, develop]
  push:
    branches: [main]

jobs:
  quality:
    name: Quality Checks
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Install dependencies
        run: npm ci

      - name: TypeScript check
        run: npm run typecheck

      - name: Lint
        run: npm run lint

      - name: Unit tests
        run: npm test -- --passWithNoTests --coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v4
        if: always()
        with:
          token: ${{ secrets.CODECOV_TOKEN }}

      - name: Security audit
        run: npm audit --audit-level=high
        continue-on-error: false

      - name: Check for secrets in code
        uses: trufflesecurity/trufflehog@main
        with:
          path: ./
          base: ${{ github.event.repository.default_branch }}
          extra_args: --only-verified

  docker-build:
    name: Docker Build Validation
    runs-on: ubuntu-latest
    needs: quality

    steps:
      - uses: actions/checkout@v4

      - name: Build Docker image (no push)
        run: docker build -t life-n-grace:pr-test .

      - name: Scan image for vulnerabilities
        uses: aquasecurity/trivy-action@master
        with:
          image-ref: life-n-grace:pr-test
          format: table
          exit-code: "1"
          severity: CRITICAL,HIGH
          ignore-unfixed: true
```

### `.github/workflows/deploy.yml` — Deploy on merge to main

```yaml
name: Deploy to AWS

on:
  push:
    branches: [main]

env:
  AWS_REGION: us-east-1
  ECR_REPOSITORY: life-n-grace
  ECS_SERVICE: LifeNGraceStack-Service
  ECS_CLUSTER: LifeNGraceStack-Cluster
  CONTAINER_NAME: app

jobs:
  deploy:
    name: Build and Deploy
    runs-on: ubuntu-latest
    environment: production   # requires manual approval if configured

    permissions:
      id-token: write    # OIDC for keyless AWS auth
      contents: read

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: "20"
          cache: "npm"

      - name: Run all quality checks
        run: |
          npm ci
          npm run typecheck
          npm run lint
          npm test -- --passWithNoTests

      - name: Configure AWS credentials (OIDC — no long-lived keys)
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: ${{ secrets.AWS_DEPLOY_ROLE_ARN }}
          aws-region: ${{ env.AWS_REGION }}

      - name: Login to ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build, tag, and push image to ECR
        id: build-image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
          docker tag $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG $ECR_REGISTRY/$ECR_REPOSITORY:latest
          docker push $ECR_REGISTRY/$ECR_REPOSITORY:latest
          echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

      - name: Download current ECS task definition
        run: |
          aws ecs describe-task-definition --task-definition life-n-grace \
            --query taskDefinition > task-definition.json

      - name: Update container image in task definition
        id: task-def
        uses: aws-actions/amazon-ecs-render-task-definition@v1
        with:
          task-definition: task-definition.json
          container-name: ${{ env.CONTAINER_NAME }}
          image: ${{ steps.build-image.outputs.image }}

      - name: Deploy to ECS (rolling update)
        uses: aws-actions/amazon-ecs-deploy-task-definition@v1
        with:
          task-definition: ${{ steps.task-def.outputs.task-definition }}
          service: ${{ env.ECS_SERVICE }}
          cluster: ${{ env.ECS_CLUSTER }}
          wait-for-service-stability: true

      - name: Notify on failure
        if: failure()
        run: |
          echo "Deployment failed for commit ${{ github.sha }}"
          # Add Slack/email notification here
```

---

## 6. AWS IAM OIDC Role Setup (Keyless CI/CD)

Instead of long-lived `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` in GitHub secrets, use OIDC — GitHub gets a short-lived token for each run.

```bash
# Create OIDC identity provider
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1

# Create trust policy
cat > trust-policy.json << 'EOF'
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": { "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com" },
    "Action": "sts:AssumeRoleWithWebIdentity",
    "Condition": {
      "StringLike": {
        "token.actions.githubusercontent.com:sub": "repo:YOUR_GITHUB_ORG/Life_n_Grace:ref:refs/heads/main"
      }
    }
  }]
}
EOF

aws iam create-role --role-name GitHubActionsDeployRole --assume-role-policy-document file://trust-policy.json

# Attach permissions (least privilege — ECR push + ECS deploy only)
aws iam attach-role-policy --role-name GitHubActionsDeployRole \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryPowerUser
```

Add `AWS_DEPLOY_ROLE_ARN` to GitHub repository secrets.

---

## 7. Database Migrations in CI/CD

Run Prisma migrations as a one-off ECS task before the rolling deployment:

```yaml
# In deploy.yml, before "Deploy to ECS":

      - name: Run database migrations
        env:
          ECS_CLUSTER: ${{ env.ECS_CLUSTER }}
        run: |
          aws ecs run-task \
            --cluster $ECS_CLUSTER \
            --task-definition life-n-grace-migrations \
            --launch-type FARGATE \
            --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx]}" \
            --overrides '{"containerOverrides":[{"name":"app","command":["npm","run","prisma:migrate:main"],"command":["npm","run","prisma:migrate:journal"]}]}'
```

Alternatively, run migrations as a separate ECS task definition (`life-n-grace-migrations`) with the same image but `command: ["sh", "-c", "npm run prisma:migrate:main && npm run prisma:migrate:journal"]`.

---

## 8. Environment Variables Reference

All secrets stored in AWS Secrets Manager. `REPLACE_AFTER_DEPLOY` values must be updated after first CDK deploy.

**Demo tier (required now):**

| Variable | Source | Notes |
|----------|--------|-------|
| `MAIN_DATABASE_URL` | Secrets Manager (auto-generated) | Built from RDS secret |
| `JOURNAL_DATABASE_URL` | Secrets Manager (auto-generated) | Built from RDS secret (same instance, different database, demo tier) |
| `AUTH_JWT_SECRET` | Secrets Manager | `openssl rand -hex 32` — `lib/env.ts` enforces ≥32 chars |
| `JOURNAL_ENCRYPTION_KEY` | Secrets Manager | `openssl rand -hex 32` — `lib/env.ts` enforces exactly 32 bytes hex |
| `APOLOGIST_API_KEY` | Secrets Manager | Apologist Fusion API key |
| `APOLOGIST_API_URL` | Secrets Manager | e.g. `https://my.gospel.bot/api/v1` |
| `APOLOGIST_MODEL_ID` | Container env | `gpt-4o` |
| `APOLOGIST_TRANSLATION` | Container env | `esv` |
| `AWS_REGION` | Container env | `us-east-1` |

**Deferred to auth sprint (project-plan v2.1 Sprint 4):**

| Variable | Source | Notes |
|----------|--------|-------|
| `NEXTAUTH_SECRET` | Secrets Manager | `openssl rand -hex 32` |
| `GOOGLE_CLIENT_ID` | Secrets Manager | From Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | Secrets Manager | From Google Cloud Console |
| `NEXTAUTH_URL` | Container env | `https://yourdomain.com` |
| `EMAIL_PROVIDER` | Container env | `ses` |

---

## 9. ISO 27001 Controls Applied to Deployment

| Control | ISO 27001 Ref | Implementation |
|---------|--------------|----------------|
| Secrets management | A.8.10 | All secrets in AWS Secrets Manager — never in env files or code |
| Least privilege | A.8.2 | OIDC role scoped to ECR + ECS only; task role scoped to required services |
| Network segmentation | A.8.22 | RDS in isolated subnets; ECS in private subnets; only ALB is public |
| Encryption at rest | A.8.24 | RDS `storageEncrypted: true`; Secrets Manager KMS encryption |
| Encryption in transit | A.8.24 | ALB forces HTTPS; RDS SSL enforced; SES TLS |
| Vulnerability scanning | A.8.8 | ECR `imageScanOnPush`; Trivy in CI; `npm audit` in CI |
| Log monitoring | A.8.15 | CloudWatch Logs 30-day retention; error rate alarms |
| Change management | A.8.32 | All deployments via CI/CD; PR review required; OIDC — no manual deploys |
| Container isolation | A.8.31 | Non-root user in Dockerfile; read-only container filesystem (add flag) |
| Backup | A.8.13 | RDS automated backups 7-day retention; Multi-AZ failover |

---

## 10. GDPR / AWS Data Residency

| Requirement | Implementation |
|-------------|----------------|
| EU data residency (if targeting EU) | Deploy to `eu-west-1` (Ireland) or `eu-central-1` (Frankfurt) |
| AWS Data Processing Agreement | Accept AWS DPA in AWS console (required for GDPR Art. 28) |
| SES email logs | Configure SES to not retain email content in CloudWatch |
| RDS encryption | Enabled — satisfies GDPR Art. 32 technical measures |
| Data deletion | RDS point-in-time recovery must also honor deletion requests — implement a background job to purge deleted user data from backups after 30 days (or document in privacy policy) |

---

## 11. Rollback Procedure

```bash
# List recent task definitions
aws ecs list-task-definitions --family-prefix life-n-grace --sort DESC

# Roll back to previous task definition revision
aws ecs update-service \
  --cluster LifeNGraceStack-Cluster \
  --service LifeNGraceStack-Service \
  --task-definition life-n-grace:PREVIOUS_REVISION \
  --force-new-deployment
```

GitHub Actions automatically retries on transient failures. If a deployment causes errors detected by CloudWatch alarms, the on-call engineer can trigger a rollback via the AWS console or CLI.

---

## 12. Pre-Launch Checklist

- [ ] CDK stack deployed and all services healthy
- [ ] RDS connections verified from ECS container
- [ ] HTTPS working with valid ACM certificate
- [ ] SES domain verified + production access granted
- [ ] Google OAuth redirect URI registered in Google Cloud Console
- [ ] All Secrets Manager values populated (no `REPLACE_AFTER_DEPLOY` remaining)
- [ ] GitHub OIDC role configured and tested
- [ ] CI pipeline passes on a test PR
- [ ] CloudWatch alarms set for: 5xx error rate >1%, response P95 >2s, CPU >80%
- [ ] ECR image scanning shows 0 critical vulnerabilities
- [ ] Privacy policy published at `/policy`
- [ ] Account deletion flow tested end-to-end
