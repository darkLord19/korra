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
```

## Docs

- Architecture and module contract: [docs/design/phase1-architecture.md](docs/design/phase1-architecture.md)
- PRD: [docs/prd/2026-10-06-edf-pack.md](docs/prd/2026-10-06-edf-pack.md)
