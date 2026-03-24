# Deployment Checklist — Vercel + Neon v1

_Status: draft_
_Last updated: 2026-03-24_

## What is already prepared in the repo

The repo has been made minimally deployment-ready for a first hosted preview:
- Node pinned to `22.x`
- root `postinstall` runs Prisma client generation
- production migration command exists: `npm run db:migrate:deploy`
- Prisma schema supports both `DATABASE_URL` and `DIRECT_URL`
- DB-backed pages are dynamic, so the hosted build does not need to pre-render live DB content at build time

## Recommended stack
- **App:** Vercel
- **Database:** Neon Postgres
- **Repo:** GitHub

## 1) Push the repo to GitHub
From `/Users/clawbot/Documents/job-ops-console`:

```bash
git add .
git commit -m "Prepare Job Ops Console for first hosted preview"
git remote add origin <your-github-repo-url>
git push -u origin main
```

## 2) Create a Neon database
In Neon:
1. Create a new project
2. Pick a region close to you/Vercel
3. Copy two connection strings:
   - **pooled** connection string → use for `DATABASE_URL`
   - **direct** connection string → use for `DIRECT_URL`

## 3) Import the repo into Vercel
In Vercel:
1. Create a new project from the GitHub repo
2. Use these settings:
   - **Framework Preset:** Next.js
   - **Root Directory:** `apps/web`
   - **Node version:** 22.x
3. Leave build command as default unless Vercel misdetects the monorepo

## 4) Add environment variables in Vercel
Add these project env vars:

- `DATABASE_URL` = Neon pooled URL
- `DIRECT_URL` = Neon direct URL
- `AUTH_ALLOWED_EMAILS` = your real email address
- `SESSION_SECRET` = a long random secret

Generate a secret with:

```bash
openssl rand -base64 32
```

## 5) Run production migrations against Neon
From your machine, in the repo root:

```bash
export DATABASE_URL='YOUR_NEON_POOLED_URL'
export DIRECT_URL='YOUR_NEON_DIRECT_URL'
npm install
npm run db:migrate:deploy
```

## 6) Optional: seed the hosted preview with demo data
If you want the first live link to show sample data immediately:

```bash
export DATABASE_URL='YOUR_NEON_POOLED_URL'
export DIRECT_URL='YOUR_NEON_DIRECT_URL'
npm run db:seed
```

## 7) Trigger the first deploy
Back in Vercel:
- click **Deploy** or **Redeploy** after env vars are set

Expected result:
- you get a live `*.vercel.app` URL
- `/health` should return OK
- login should work with the email in `AUTH_ALLOWED_EMAILS`

## 8) Smoke test the live preview
Verify:
- landing page loads
- login works
- Activity page loads
- seeded or real DB-backed records appear
- `/health` responds successfully

## If Vercel does not detect the monorepo cleanly
Use this fallback:
- keep the project connected to the same repo
- set project root to repo root instead
- set **Build Command** to:
  ```bash
  npm run web:build
  ```

If that happens, stop there and ask for a repo-specific Vercel adjustment instead of guessing.
