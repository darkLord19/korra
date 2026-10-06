# Korra

Korra helps Indian freelancers and agencies file export declaration forms (EDF) with their AD bank and track realisation of foreign receipts. Phase 1 is the EDF pack wedge.

## Stack

pnpm 10 + turbo workspace, TypeScript (strict, ESM), Node 22+. Next.js 16 App Router + Tailwind v4 in `apps/web`; domain in `packages/core`; `ingest`, `packs`, `db`, `backend` are server-only packages consumed as TS source. Dependency rules are enforced by dependency-cruiser.

## Commands

```
pnpm install
pnpm lint        # eslint + dependency-cruiser (architecture rules)
pnpm typecheck
pnpm test
pnpm build
pnpm --filter @korra/web dev
pnpm --filter @korra/local dev   # the client-only app (apps/local), webpack dev server
pnpm e2e         # apps/web Playwright smoke test (runs in CI, not part of pnpm test)
pnpm e2e:local   # apps/local Playwright flow against the strict-CSP production build
```

## Run locally without Supabase

Dev-only in-memory mode: PGlite database, in-memory blob store, console mailer and a fake extractor. Data is lost on restart. It is ignored when `NODE_ENV=production`.

```
KORRA_DEV_INMEMORY=1 pnpm --filter @korra/web dev
```

- Sign up at http://localhost:3000/sign-up. The verification link is printed in the dev server's terminal (the console mailer; the last 50 mails are also at `/api/dev-mail`, dev mode only); open it to finish.
- Uploads go to `/api/dev-upload` (a stand-in for the Supabase signed upload URL; 404 unless the mode is on). Pack downloads are served from the same route.
- There is no LLM: CSVs (the Deel export in `packages/ingest/fixtures/deel/`) are parsed for real; a PDF named `demo-invoice.pdf` is read as a sample invoice (INV-2026-014, USD 1,500, SAC code at 60% confidence so it is flagged).

## Deploy

1. **Supabase** (region **ap-south-1, Mumbai**). Create a **private** storage bucket named `documents`. Collect the pooler URL (transaction mode, port 6543) for `DATABASE_URL`, the direct connection URL for `DATABASE_URL_DIRECT`, the project URL and the service role key.
2. **Migrate**: `DATABASE_URL_DIRECT=... pnpm --filter @korra/db db:migrate` (creates the Better Auth and domain tables and enables RLS with no policies).
3. **Vercel**: import the GitHub repo, set **Root Directory** to `apps/web`, framework Next.js. Because the app imports workspace packages from outside that directory, make sure **Include source files outside of the Root Directory in the Build Step** is enabled (Project Settings, Build and Deployment, Root Directory; it is on by default for projects created since 2020). Vercel detects pnpm from the root lockfile and installs the whole workspace. The region (`bom1`) and cron schedule come from `apps/web/vercel.json`.
4. **Environment variables** (Production, and Preview if wanted):

| Variable | Notes |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler (6543) |
| `DATABASE_URL_DIRECT` | Direct URL, used only for migrations (not needed at runtime) |
| `SUPABASE_URL` | Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Server only. Never expose to the browser |
| `SUPABASE_BUCKET` | `documents` (default) |
| `BETTER_AUTH_SECRET` | At least 32 characters, e.g. `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | Public base URL of the app |
| `APP_URL` | Public base URL of the app (used in emails and links) |
| `RESEND_API_KEY`, `MAIL_FROM` | Resend key and a sender on a verified domain. Without a key, mails are only printed to the log, so nobody can verify their email |
| `ANTHROPIC_API_KEY` | For PDF/image extraction. Without it, only CSV rails are read |
| `KORRA_LLM_ENABLED` | `true`; set `false` to disable LLM extraction (see ADR-0001) |
| `CRON_SECRET` | Vercel sends it as `Authorization: Bearer ...` to the cron routes, which reject other callers |

5. **Crons** run only on **production** deployments. The Hobby plan allows once-per-day schedules only (a more frequent expression fails the deploy) with about an hour of timing slack, so `/api/cron/sweep` (02:00 UTC) and `/api/cron/notify` (03:30 UTC) run daily. Stuck document ingests are also retried when the owner opens a month page.
6. **Known unverified** (not yet exercised against real services): browser uploads to real Supabase signed URLs, Better Auth over the transaction pooler, live Claude extraction, and `after()` background work on Vercel.

Data handling and the LLM decision: [docs/adr/0001-llm-extraction-outside-india.md](docs/adr/0001-llm-extraction-outside-india.md).

## Docs

- Architecture and module contract: [docs/design/phase1-architecture.md](docs/design/phase1-architecture.md)
- ADR: [docs/adr/0001-llm-extraction-outside-india.md](docs/adr/0001-llm-extraction-outside-india.md)
- PRD: [docs/prd/2026-10-06-edf-pack.md](docs/prd/2026-10-06-edf-pack.md)

## End-to-end smoke test

`pnpm e2e` starts `next dev` in the in-memory mode on a free port and drives sign-up to pack, tracker and CA sharing in your installed Google Chrome. Without Chrome, run `pnpm --filter @korra/web exec playwright install chromium` and set `E2E_BROWSER=chromium`.

`pnpm e2e:local` builds `apps/local` with `pnpm build` (two passes: the second bakes in the sha256 hashes of Next's inline scripts, so the served `script-src` is strict), serves it with `next start` on a free port, and drives the whole client-only flow (onboarding, upload, review, pack, tracker), asserting that no request leaves the origin, that every request is a GET, and that the console has no CSP violations. Same Chrome/`E2E_BROWSER` convention.
