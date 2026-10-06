# ADR-0002: Ship v0 as a client-only app

**Status:** Accepted · **Date:** 2026-10-06 · **Supersedes for v0:** ADR-0001 (LLM extraction outside India)

## Context

The product's positioning is privacy for highly sensitive data: PAN, GSTIN, client names and invoices. The PRD (§11) also asks for that data to be stored in India.

Phase 1 was built on a server stack: Supabase Mumbai, Better Auth, Vercel functions and Claude extraction. Claude extraction sends documents outside India (ADR-0001).

The founder wants the launch pitch to be: "Your PAN and invoices never leave your device".

## Decision

**What v0 is**
- v0 is a static Next.js app (`apps/local`). The existing use-cases run in the browser against:
  - PGlite persisted to IndexedDB;
  - an IndexedDB blob store;
  - a local pdf.js extractor.
- No document or field leaves the device. A Content Security Policy (`connect-src 'self'`) enforces this, and an end-to-end test checks it.

**What it drops**
- AI extraction (replaced by local text extraction, review and manual entry);
- accounts, sync and live CA sharing;
- email reminders.

**What stays**
- The server stack stays in the repo, tested, behind the same use-case interface. A `KorraApi` interface sits in front of the shared UI, with two adapters: server actions and in-browser calls.

## Consequences

**Benefits**
- Data residency questions are moot for v0.
- No infrastructure costs or keys are needed before launch.
- The privacy claim can be checked: the end-to-end test asserts that no request leaves the origin.

**Costs**
- **Durability depends on the browser.** Backup and restore, `navigator.storage.persist()` and backup prompts are v0 features.
- **Review takes longer** without AI extraction. "I've checked these" and manual entry mitigate this. The 15-minute goal needs to be measured again.
- **The PRD metrics can't be collected** without some telemetry (open question Q-A1).
- **Bundle size grows** with the PGlite WASM and pdf.js. The spike measures it.
- **Moving to the server later** needs an import path from a `.korra` backup file into the server database.
