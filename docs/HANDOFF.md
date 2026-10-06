# Korra handoff

**Date:** 2026-10-06 · **Repo:** github.com/darkLord19/korra · **Branch:** `dev` (pushed; there is no `main` on the remote yet) · **Last commit:** see `git log` (V2a landed after `da735ad`) · **CI:** green on `da735ad`; V2a verified locally

## 1. What Korra is

Korra is an EDF compliance tool for Indian service exporters. From 1 Oct 2026, every service exporter has to file a monthly Export Declaration Form (EDF) with their AD bank, and then track each export until the money is realised. The PRD is `docs/prd/2026-10-06-edf-pack.md`. Phase 1 supports one rail, Deel.

## 2. Read these first

| Doc | Why |
|---|---|
| `docs/design/phase1-architecture.md` | The module design and the contract the packages implement |
| `docs/design/v0-client-only-and-declarations.md` | The current scope: a client-only v0 plus realisation declarations |
| `docs/adr/0001-llm-extraction-outside-india.md`, `docs/adr/0002-client-only-v0.md` | Decisions |
| `docs/research/2026-10-06-deel-local-transfer-edpms.md` | The legal basis, quoted verbatim from FEMA 23(R)/2026-RB |
| `docs/research/2026-10-06-v0-browser-spike.md` | Browser feasibility, measurements and constraints |
| `README.md` | Commands, local dev, and the Phase 1 deploy steps |

## 3. Decisions already made (don't re-litigate)

**Stack and architecture**
- Next.js on Vercel, in a pnpm/turbo monorepo.
- Supabase for the Phase-1 server database. Better Auth for authentication, not Supabase Auth.
- The frontend/backend seam is enforced by dependency-cruiser (`pnpm lint`).
- The Vercel plan is **Hobby**, so crons run once a day.

**Regulatory facts**
- The EDF is an **invoice** declaration. Payments drive the realisation tracker and never block a pack.
- Realisation is due **9 months** after the invoice date, or **12** for INR invoices. An amendment on 22 Sep 2026 replaced 15 and 18. Treat pre-September sources as stale.

**Deel local transfers (Q1, resolved)**
- The EDF goes to the exporter's own AD bank.
- For an invoice of ₹10 lakh or less, the EDPMS entry **may** be closed on the exporter's declaration (Reg 4(2) proviso, quarterly bulk allowed). It is the bank's choice.
- Above ₹10 lakh it is at the bank's discretion (Reg 8), or the exporter withdraws by SWIFT instead.

**v0 shape (founder decisions)**
- v0 is **client-only**: data stays in the browser, on PGlite plus IndexedDB, and PDFs are read locally with pdf.js.
- The server stack stays in the repo, tested, but is not deployed.
- **Dropped for v0:** accounts and sync, live CA sharing, email reminders, AI extraction and billing.
- **Anonymous usage counts are on by default**, with an opt-out. Scope §A9 defines them: a fixed payload with no names, amounts or documents, sent to a same-origin `POST /api/metrics`.

**Working rules**
- Implementation is done by **Sonnet subagents**.
- The coordinating session reviews each stage, commits and merges.

## 4. Done and committed

| Area | State |
|---|---|
| Phase 1 server app (`apps/web`) | Complete and tested, but never deployed. Covers auth, onboarding, upload and ingest, review and matching, EDF pack (PDF, XLSX, zip, guide), tracker, CA sharing, crons, and a Playwright smoke test (`pnpm e2e`) |
| `core` | Matching, realisation, pack readiness (`ReadyPack` brand), schedule, and declarations (`assessDeclaration`, quarters with FY labels, ₹10 lakh limit and near-limit band). 94 tests |
| `packs` | EDF pack and declaration rendering. Layouts: generic, plus ICICI, HDFC and Axis **placeholders** |
| `ingest` | Deel and generic CSV/XLSX parsers. The Deel columns are **guesses** (Q2). Claude extractor in `/server`. Local pdf.js rule extractor in `/pdf` (confidence 0.6, always flagged) |
| `db` | Drizzle schema with RLS on; repositories scoped to the actor; audit log. `/browser` has the bundled migrator, `PGliteWorker` with multi-tab leader election, an IndexedDB blob store, and `.korra` backup and restore |
| `backend` | All use-cases are isomorphic (they run in Node or the browser). `/server` has `createDeps`, Better Auth, mailers and env. `/browser` has `createLocalDeps` and `ensureLocalOwner`. New: `createInvoiceManually`, `createPaymentManually`, `confirmAllFields` |
| `ui` (V2a) | `@korra/ui`: isomorphic screens (month, tracker, pack, onboarding, settings) behind `KorraApi` (owner use-cases, `uploadFile`, `capabilities`, `KorraApiError`) and `KorraNav`. Hand entry and "I've checked these" are in the month view. `apps/web` is a server-action adapter (`src/server/actions.ts`, `src/client/server-api.ts`), behaviour unchanged |
| `apps/spike-local` | Throwaway browser spike. Delete it once `apps/local` exists |

Verified on `da735ad`:
- lint, typecheck and build pass;
- 238 unit tests pass, plus 1 live LLM test skipped;
- `pnpm e2e` passes;
- CI passes.

## 5. V2a is done

V2a was verified and committed: lint, depcruise (both configs), typecheck, build, unit tests and `pnpm e2e` all pass. The only fix needed was an e2e locator in `smoke.spec.ts`. Cell buttons have aria-labels ("Edit Payer"), so a table row's accessible name does not contain the value; match the button text instead.

## 6. Remaining stages (spec: `docs/design/v0-client-only-and-declarations.md`)

1. ~~**V2a: `packages/ui` and `KorraApi`**~~ **Done** (see §5). Original brief kept for reference:
   - Move the screens into an isomorphic `@korra/ui` that talks to the app only through `KorraApi`. That means owner use-cases with wire types, an `uploadFile` transport, a `capabilities` flag and a `KorraApiError`.
   - Routing goes through a `nav` prop; app-specific settings are slots.
   - Add "I've checked these" and hand-entry forms to the month view.
   - `apps/web` gets a server-action adapter and must stay identical; the e2e must pass.
2. **V2b: `apps/local`.**
   - **Build:** a Next app built with **webpack, not Turbopack**, because Turbopack breaks PGlite. Pages are client-rendered.
   - **Browser setup:**
     - a worker file calling `startKorraPgliteWorker()`;
     - `createWorkerClient`, then `createLocalDeps`, then `ensureLocalOwner`;
     - the IndexedDB blob store;
     - the pdf.js worker served from `/pdfjs/`.
   - **Data safety:** call `navigator.storage.persist()` and show the result; backup and restore UI with prompts; "Delete all local data".
   - **Other features:** `.ics` export, an "Export for my CA" zip, and the privacy copy, including advising "Add to Home Screen" on Safari.
   - **CSP:** take the strict hash-based policy from `apps/spike-local`, with its fixed build id and two-pass build.
   - **e2e:**
     - the full flow;
     - **no requests leave the origin** when metrics are off;
     - the backup round trip;
     - tolerate the one harmless `ErrnoError` on cold boot.
3. **V3: declarations end to end.**
   - **Migration:**
     - a `pack_invoice` link table, backfilled;
     - `declaration` and `declaration_invoice` tables;
     - an `inrEquivalent` column, plus adding it to `INVOICE_FIELDS`/`MONEY_FIELDS` in db `mapping.ts` and to `INVOICE_FIELD_NAMES` in backend `inputs.ts`;
     - `invoice.reduction_choice`.
   - **Prefill:** `inrEquivalent` from the realising payment, at confidence 0.7.
   - **Use-cases:** `getDeclarationState`, `setReductionChoice`, `generateDeclaration`, `markDeclarationSubmitted`, `getDeclarationDownloads`.
   - **UI:**
     - a Declarations tab;
     - the tracker shows "Closure declared";
     - a warning in the tracker for over-limit local transfers.
4. **V4: metrics and deploy.**
   - `POST /api/metrics` in `apps/local` with a strict zod schema, writing a `metric_event` table in Supabase Mumbai.
   - A settings toggle (on by default) and the first-run copy.
   - An e2e check that only `/api/metrics` is called when the toggle is on.
   - Deploy `apps/local` to Vercel (Hobby). Delete `apps/spike-local`.

## 7. Gotchas

- **Subagents can't run git writes.** The rtk hook rewrites `git` to `rtk git`, which the harness blocks for subagents. The coordinator commits for them, staging only the intended paths.
- **Generated agent files.** `next dev` and turbo regenerate `AGENTS.md` and `apps/web/CLAUDE.md`. Both are gitignored; never commit them.
- **Lint output.** Use `rtk proxy pnpm lint` to see real lint output, because the rtk filter can garble it.
- **Turbopack breaks PGlite in production.** Use `next build --webpack` for anything that loads PGlite.
- **Multiple tabs.** Plain PGlite on `idb://` silently loses writes when two tabs are open. Always use `PGliteWorker`.
- **Vercel Hobby.** A cron that runs more than daily fails the deploy. Crons only run on production deployments.
- **Local mode.** Run `apps/web` locally without Supabase via `KORRA_DEV_INMEMORY=1`; mail is read back via `/api/dev-mail`.

## 8. Open items for the founder

- **Deel samples**, into `packages/ingest/fixtures/deel/`, in priority order:
  1. an invoice PDF;
  2. the transaction export (Q2: the parser's column names are guesses);
  3. a FIRA, a local-transfer receipt, and an NOC.
- **Bank formats (Q3).** Real EDF and declaration formats from ICICI, HDFC and Axis. The bank layouts are placeholders until then.
- **Infrastructure for the metrics endpoint.** A Supabase project in ap-south-1 and the Vercel project. ADR-0002 notes that v0 needs no other infrastructure.
- **PRD §11 wording.** It still says "stored in India" and mentions zero-retention LLM terms, which ADR-0001 and ADR-0002 supersede.
- **`main` branch.** Create `main` on the remote from `dev` so pull requests have a target.
