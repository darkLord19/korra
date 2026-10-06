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
pnpm e2e         # Playwright smoke test (not part of pnpm test / CI)
```

## Run locally without Supabase

Dev-only in-memory mode: PGlite database, in-memory blob store, console mailer and a fake extractor. Data is lost on restart. It is ignored when `NODE_ENV=production`.

```
KORRA_DEV_INMEMORY=1 pnpm --filter @korra/web dev
```

- Sign up at http://localhost:3000/sign-up. The verification link is printed in the dev server's terminal (the console mailer; the last 50 mails are also at `/api/dev-mail`, dev mode only); open it to finish.
- Uploads go to `/api/dev-upload` (a stand-in for the Supabase signed upload URL; 404 unless the mode is on). Pack downloads are served from the same route.
- There is no LLM: CSVs (the Deel export in `packages/ingest/fixtures/deel/`) are parsed for real; a PDF named `demo-invoice.pdf` is read as a sample invoice (INV-2026-014, USD 1,500, SAC code at 60% confidence so it is flagged).

## Docs

- Architecture and module contract: [docs/design/phase1-architecture.md](docs/design/phase1-architecture.md)
- PRD: [docs/prd/2026-10-06-edf-pack.md](docs/prd/2026-10-06-edf-pack.md)

## End-to-end smoke test

`pnpm e2e` starts `next dev` in the in-memory mode on a free port and drives sign-up to pack, tracker and CA sharing in your installed Google Chrome. Without Chrome, run `pnpm --filter @korra/web exec playwright install chromium` and set `E2E_BROWSER=chromium`.
