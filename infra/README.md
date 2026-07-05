# Life 'n' Grace — Demo-Tier Infrastructure (Lambda + Function URL)

CDK app for the demo/beta deployment ([aws-cicd-spec §0](../docs/aws-cicd-spec.md)).
Two stacks:

| Stack | Contents |
|-------|----------|
| `LifeNGraceBase` | VPC (no NAT), ECR, RDS Postgres (1× db.t4g.micro, both databases), app secrets, GitHub OIDC deploy role |
| `LifeNGraceApp` | Lambda (container image + Web Adapter, streaming) + public Function URL |

Estimated cost: **~$16/month** (Lambda compute rides the always-free tier).

## One-time setup (your part — needs your AWS credentials)

```bash
# 0) Prereqs: AWS CLI configured (aws configure), Node 20+
cd infra && npm install

# 1) Bootstrap CDK (once per account/region)
npx cdk bootstrap

# 2) Deploy the base stack (VPC, ECR, RDS, secrets, OIDC role)
npx cdk deploy LifeNGraceBase
#    → note the outputs: DeployRoleArn, EcrRepoUri, AppSecretsArn
#    If your account already has a GitHub OIDC provider, re-run with:
#    npx cdk deploy LifeNGraceBase -c createOidcProvider=false

# 3) Wire up GitHub Actions:
#    - Repo secret  AWS_DEPLOY_ROLE_ARN = <DeployRoleArn output>
#    - Repo variable AWS_DEPLOY_ENABLED = true
#    Then run the "Deploy to AWS (demo tier)" workflow (or push a commit).
#    First run builds + pushes the image and prepares the databases;
#    it will warn that the Lambda doesn't exist yet — that's expected.

# 4) Populate real app secrets (placeholders will refuse to boot):
aws secretsmanager put-secret-value --secret-id life-n-grace/app \
  --secret-string "{\"AUTH_JWT_SECRET\":\"$(openssl rand -base64 48)\",\"JOURNAL_ENCRYPTION_KEY\":\"$(openssl rand -hex 32)\"}"

# 5) Deploy the app stack (Lambda + Function URL)
npx cdk deploy LifeNGraceApp
#    → FunctionUrl output is your demo URL 🎉
```

From then on: **every push to `typescript_Nextjs` (or `main`) auto-deploys** —
CI quality gates → image build → ECR push → schema push → Lambda update.

## Notes

- **Secrets rotation:** after changing `life-n-grace/app` values, re-run
  `npx cdk deploy LifeNGraceApp` — the Lambda environment resolves secret
  values at deploy time (CloudFormation dynamic references).
- **Apologist activation (companion AI):** when the API key is available —
  add a NAT (t4g.nano instance or NAT gateway) so the Lambda has outbound
  internet, add `APOLOGIST_API_KEY`/`APOLOGIST_API_URL` to the app secret
  and `app-stack.ts` environment, redeploy. Until then the companion
  returns a friendly "not yet available" message.
- **DB access model (demo tier):** RDS sits in a public subnet so CI can
  run `prisma db push` through a security-group rule that exists only for
  the seconds the deploy job runs (authorized → used → revoked, keyed to
  the runner's IP). At all other times only the Lambda security group is
  admitted. Journal content is additionally AES-256-GCM encrypted at the
  application layer. The production tier moves RDS to isolated subnets.
- **Rollback:** point the function at any previous image tag:
  `aws lambda update-function-code --function-name life-n-grace-demo --image-uri <EcrRepoUri>:<old-sha>`
- **Demo accounts:** create via the app's signup page, or ask Claude to add
  a seed script in Sprint 3.
