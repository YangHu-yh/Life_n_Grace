# AWS Deployment Plan

## Architecture

- **Next.js app** deployed on **AWS App Runner** or **ECS Fargate**.
- **Main database (auth + users)** on **RDS PostgreSQL**.
- **Journal database** on a **separate RDS PostgreSQL instance**.
- **Secrets Manager** stores all secrets (JWT, encryption key, API keys).
- **CloudWatch** for logs and alerts.

## Local testing (Docker)

This repo includes a local Postgres setup to make Prisma migrations reproducible:

1. Install Docker Desktop and ensure the daemon is running.
2. Start Postgres:
   - `npm run db:up`
   - If daemon error appears, launch Docker Desktop and retry.
3. Set `.env.local` values (example):
   - `MAIN_DATABASE_URL="postgresql://lifeuser:lifepass@localhost:5432/life_n_grace_main"`
   - `JOURNAL_DATABASE_URL="postgresql://lifeuser:lifepass@localhost:5432/life_n_grace_journal"`
4. Run migrations:
   - `npm run prisma:generate`
   - `npm run prisma:migrate:main`
   - `npm run prisma:migrate:journal`

## Security plan

- Journal data is encrypted at the application layer with AES-256-GCM.
- Separate DB for journal entries reduces blast radius.
- Use private subnets for databases; app connects via security group rules.
- Rotate `JOURNAL_ENCRYPTION_KEY` and `AUTH_JWT_SECRET` periodically.

## CI/CD (GitHub Actions)

1. On push to `main`:
   - Install dependencies
   - Lint + typecheck
   - Build Next.js
2. Build and push container image to ECR.
3. Deploy updated task to ECS/App Runner.

## Env vars in AWS

- Use `config/env.aws.example` as the template.
- `MAIN_DATABASE_URL`
- `JOURNAL_DATABASE_URL`
- `AUTH_JWT_SECRET`
- `JOURNAL_ENCRYPTION_KEY`
- `APOLOGIST_API_KEY`
- `APOLOGIST_API_URL`
- `APOLOGIST_MODEL_ID`
- `APOLOGIST_TRANSLATION`

## Optional scaling

- Add a queue (SQS) for heavy LLM workloads.
- Add Redis (ElastiCache) for caching prayer generation results.

## Changing the sender email

The sender identity is pure configuration — no code changes, ever:

- **`EMAIL_FROM`** — the visible From address/name.
- **Provider** — first match wins: `EMAIL_PROVIDER="ses"` → SES; else
  `SMTP_HOST`+`SMTP_USER`+`SMTP_PASS` all set → SMTP; else `RESEND_API_KEY` →
  Resend; else email is off (flows soften: signups auto-verify, reminder
  sends are logged and skipped).

**Temp phase (Gmail):** in the `life-n-grace/app` secret set
`EMAIL_FROM` to the Gmail address, `SMTP_HOST=smtp.gmail.com`,
`SMTP_PORT=587`, `SMTP_USER` = the address, `SMTP_PASS` = an app password
(myaccount.google.com/apppasswords — requires 2FA on the account), and leave
`EMAIL_PROVIDER` empty. Gmail rewrites the From header to the authenticated
account, so `EMAIL_FROM`'s address part must be that same Gmail address.
Sending limit ~500/day — fine for testing, not launch.

**Formal address later:** verify the domain in SES (SPF/DKIM — needs the
custom domain from Sprint 8/G3), then in the same secret set
`EMAIL_PROVIDER="ses"` and `EMAIL_FROM="Life-n-Grace <noreply@your-domain>"`.
The SMTP_* values are then ignored; clear them at leisure.

Both switches are Secrets Manager value edits. Remember the standing gotcha:
CloudFormation caches resolved dynamic references, so after changing secret
VALUES force the Lambda environment to refresh (touch the env in a
`cdk deploy`, or `aws lambda update-function-configuration`) — a plain
redeploy of the same template will not pick them up.
