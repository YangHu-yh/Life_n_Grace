# Life 'n' Grace (Next.js + TypeScript)

AI prayer generation and secure journaling with a future-ready, mobile-friendly web app.

## Stack

- Next.js (App Router) + TypeScript
- Prisma with two PostgreSQL databases
- JWT auth (httpOnly cookie)
- Field-level encryption for journal content
- Apologist Fusion API for prayer generation

## Local setup

1. Install dependencies:
   - `npm install`
2. Copy environment variables:
   - `cp config/env.example .env.local`
   - (`config/env.example` is prefilled for local Docker Postgres defaults)
3. Start local Postgres (Docker):
   - Install and start Docker Desktop
   - `npm run db:up`
   - If you see `Cannot connect to the Docker daemon`, open Docker Desktop and wait until it is running, then retry.
4. Generate Prisma clients:
   - `npm run prisma:generate`
5. Prisma migrations read from `.env`:
   - `cp .env.local .env`
6. Create and migrate databases:
   - `npm run prisma:migrate:main`
   - `npm run prisma:migrate:journal`
7. Run the dev server:
   - `npm run dev`

## Key routes

- `/` Home
- `/prayers` Unified prayers and journal workspace
- `/companion` AI chat companion
- `/profile` Profile and reminder settings
- `/login` Sign in
- `/signup` Create account
- `/forgot-password` Reset access
- `/policy` Transparent data usage

## Auth + secure journal

- Auth uses a JWT stored in a secure, httpOnly cookie.
- Journal entries are encrypted before storage and live in a separate database.

## LLM integration

Prayer chat uses Apologist Fusion's OpenAI-compatible API. Configure:

- `APOLOGIST_API_KEY`
- `APOLOGIST_API_URL`
- `APOLOGIST_MODEL_ID`
- `APOLOGIST_TRANSLATION`

## AWS deployment plan

See `DEPLOYMENT.md` for the production AWS plan and CI/CD pipeline.

For AWS environment values, start from `config/env.aws.example` and store
secrets in AWS Secrets Manager.
