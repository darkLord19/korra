# v0: client-only Korra, and realisation declarations

**Status:** Draft scope · **Date:** 2026-10-06 · **Builds on:** `phase1-architecture.md`, `docs/research/2026-10-06-deel-local-transfer-edpms.md` · **Decision record:** ADR-0002

Two pieces of work:
- **A. A client-only v0.** The whole app runs in the browser and stores its data there. Nothing leaves the device. This is the launch privacy pitch: "Your PAN and invoices never leave your device".
- **B. Realisation declarations.** These are the documents an exporter gives their AD bank so it may close EDPMS entries for invoices up to ₹10 lakh (FEMA 23(R)/2026-RB, Reg. 4(2) proviso and Reg. 6).

The server stack built in Phase 1 (Supabase, Better Auth, cron and email) **stays in the repo, tested**, for when sync, CA sharing or billing are needed. Phase-1 `apps/web` and its e2e test must stay green throughout.

---

## A. Client-only v0

### A1. Approach: run the existing use-cases in the browser

Don't write a second storage layer. The `backend` use-cases already take everything they depend on through `Deps`, so v0 passes in browser adapters:

| `Deps` field | Server (apps/web) | Browser (apps/local) |
|---|---|---|
| `db` | postgres-js (Supabase) | **PGlite persisted to IndexedDB** (`idb://korra`), migrations bundled in |
| `blobs` | Supabase Storage | **IndexedDB blob store**: a new `BlobStore` adapter. Downloads are `blob:` URLs |
| `ingester` | Claude extractor | **Local extractor:** pdf.js text layer plus rules. It is a third adapter on the `LlmExtractor` seam. CSV and XLSX parsing are unchanged |
| `mailer` | Resend | none (no-op) |
| actor | Better Auth session | A single local owner, seeded on first run |

This keeps one copy of the repository logic: the audit log, FIRA merge, re-ingest guards, matching and readiness. The fallback is a separate IndexedDB repository layer, used only if the spike (A7) shows PGlite can't work in the browser.

### A2. Package split

**Problem:** the packages start with `import "server-only"` at their root, which breaks any client build.

**Fix:**
- Move `server-only` into the entries that are genuinely server-only:
  - `@korra/db/server` (`createDb` with postgres-js, the Supabase blob store);
  - `@korra/ingest/server` (the Claude extractor);
  - `@korra/backend/server` (`createDeps`, `createAuth`, `getOwnerCtx`/`getCaCtx`, mailers, env).
- The main entries become **isomorphic**, meaning they run on both server and browser:
  - `@korra/db` (schema, repos, the `Db` type, the memory and IndexedDB blob stores);
  - `@korra/ingest` (`createIngester`, CSV/XLSX parsers, fake and local extractors);
  - `@korra/packs`;
  - `@korra/backend` (use-cases, inputs, wire types).
- Replace `node:crypto` in `db` (`blob.ts`, `repos.ts`) with `globalThis.crypto`.
- New `@korra/db/browser` holds `createBrowserDb()` (PGlite on `idb://`, with the bundled migrator).

**Enforcement:** a dependency-cruiser rule says that nothing reachable from `apps/local` or the isomorphic entries may import any of these:
- `better-auth`, `resend`, `@supabase/supabase-js`, `postgres`;
- `@anthropic-ai/sdk`;
- `node:*`, `server-only`;
- any `*/server` entry.

### A3. Apps and shared UI

- **New `apps/local`:** Next.js with `output: "export"`, deployed to Vercel as static files.
  - It has no server actions, route handlers or `proxy.ts`.
  - Dynamic pages become query params: `/month?m=2026-10` and `/pack?id=…`.
- **New `packages/ui`:**
  - The month, pack and tracker views, and the onboarding and settings forms, move here from `apps/web`.
  - They take a **`KorraApi` interface** prop, which holds the use-case calls with wire-typed inputs and outputs.
  - The two adapters:
    - `apps/web` uses server actions (Phase 1 behaviour, unchanged);
    - `apps/local` calls the use-cases in the browser against the local `Deps`.
  - Because there are two adapters, this is a real seam.
- **Local `Deps` lifecycle:** one instance per tab, created lazily. Writes are serialised across tabs; see A7 on multiple tabs.

### A4. Privacy, enforced rather than claimed

- **Content Security Policy** in `apps/local`:
  - `default-src 'self'`, `connect-src 'self'`, no third-party origins;
  - `worker-src 'self' blob:`;
  - `script-src 'self' 'wasm-unsafe-eval'`.
- **Self-hosted assets:** the pdf.js worker and the PGlite WASM are served from our own origin. No CDN, analytics or fonts from third parties.
- **e2e test:** the full flow runs with every request recorded, and the test asserts that **no request leaves the origin**.
- **Copy:**
  - "Your documents and details are stored only in this browser. Korra has no server copy. Back up regularly."
  - The disclaimer stays.

### A5. Durability. This is the biggest product risk.

The tracker is a ledger covering 9 to 12 months, and browser storage can be evicted.

- **On first run:** call `navigator.storage.persist()` and show the result. If it is not granted, show a persistent warning.
- **Backup and restore** are a v0 feature:
  - A backup is one `.korra` file: a zip holding the PGlite dump (`dumpDataDir`), every blob, and a manifest with the schema version and timestamp.
  - Restoring replaces the local data after a confirmation.
- **Backup prompts:** after each pack or declaration is generated, and when the last backup is more than 30 days old.
- **e2e round trip:** do the full flow → back up → clear site data → restore → check that `getMonthState` and `getTracker` are identical.
- **Safari:** look up WebKit's current eviction rules for script-writable storage in the spike and record what you find. Recommend "Add to Home Screen" or desktop browsers in the copy if it applies.

### A6. Local PDF extractor and manual entry

- **Text extraction:** pdf.js (`pdfjs-dist`) extracts the text layer of PDFs. Rules pull out the invoice number, dates, amount with currency, client name and country, SAC code, FIRA reference and purpose code.
- **No unreviewed fields:** every extracted field gets **confidence 0.6**, which is below `FLAG_THRESHOLD`. No pack can contain an extracted field the user hasn't reviewed.
- **Scanned PDFs and images:** there's no OCR in v0. The document is stored and the user types the invoice.
- **New use-cases:**
  - `createInvoiceManually(ctx, {documentId?, fields})` and `createPaymentManually(...)`: user-sourced fields with confidence 1.
  - `confirmAllFields(ctx, {entity, id})`: an "I've checked these" action. It marks every non-null field as user-set and writes one audit row per field.

### A7. Spike, done first, in its own worktree

The spike settles these before the full build:
1. **The stack runs in a browser:**
   - A static-export page boots PGlite on `idb://` and applies the bundled migrations.
   - It runs `saveProfile`, then `getOnboarding`.
   - It ingests the Deel CSV fixture and calls `renderPack` in the browser.
2. **Bundling:** a migrator that works without `fs`, with the migration SQL bundled in.
3. **Numbers:** the gzipped JS plus WASM size for the route, and the time to the first query on a cold and a warm start.
4. **Multiple tabs:** two tabs writing to one PGlite store. Evaluate `PGliteWorker` (leader election) against a Web Locks guard.
5. **The CSP above** works with PGlite WASM and the pdf.js worker.
6. **Safari eviction rules**, as in A5.

### A8. Dropped in v0

| Phase 1 feature | v0 replacement |
|---|---|
| Accounts, sign-in, multi-device | None. One browser profile. Backup and restore move data |
| Share with my CA (live read access) | "Export for my CA": a zip of the packs, declarations and a tracker CSV |
| Email reminders and cron | A downloadable `.ics` calendar with EDF due dates, realisation deadlines and the 60/30-day alerts. It is regenerated on every change, and the app prompts the user to re-download it |
| Server-side account deletion | "Delete all local data", with a confirmation |
| AI extraction (Claude) | Local text extraction plus review. Manual entry for scanned PDFs |
| Pro billing | Not in v0 |
| PRD metrics (monthly active filers, share with two or more rails, CA count) | **Undecided:** none, or anonymous counts with no document content. See Q-A1 |

---

## B. Realisation declarations

### B1. Rules (verbatim basis in the research note)

- **Reg. 4(2) proviso:** for a services invoice "up to ₹10 lakh (or its equivalent in foreign currency), entry in EDPMS **may** be closed based on a declaration from the exporter … realised either in full or otherwise". It may be submitted "on a quarterly basis for bulk closure". The bank decides whether to accept it, so copy must never say the bank *will* close the entry.
- **Reg. 6 proviso:** for an invoice up to ₹10 lakh, a reduction or non-realisation "may be permitted based on a declaration from the exporter".
- **Format:** RBI prescribes none. We provide a generic layout and placeholder layouts per bank.

### B2. Which invoices are eligible

An invoice is eligible when all of these hold:
- it was declared in an EDF pack that is **marked submitted** at that AD bank (only declared invoices have an EDPMS entry);
- its **INR equivalent is ₹10,00,000 or less**;
- its realisation status is final for the declaration:
  - `realised` (in full);
  - `partially_realised` or `open` that the user explicitly declares as a reduction or non-realisation (Reg. 6);
- it has not already appeared in a submitted declaration.

**Data change:** a pack doesn't currently record which invoices it declared. Add a `pack_invoice (pack_id, invoice_id)` link table, written by `generatePack`, and backfill it from existing packs' rows.

### B3. The INR equivalent and the ₹10 lakh test

- **New invoice field `inrEquivalent: Field<Money>`.** It is optional for the EDF and required for declarations.
- **Prefill** from the realising payment: `inrCredited` (Deel local transfer) or `foreignAmount × fxRate`. Confidence 0.7, so it gets reviewed. The user can edit it.
- **Near the limit:** flag invoices between ₹9,00,000 and ₹11,00,000 as "near the ₹10 lakh limit — confirm the INR equivalent".
- **No network rate lookup.** The regulation names no conversion date, and a client-only app can't fetch RBI reference rates anyway.
- **Over the limit, paid by local transfer:** show a warning in the tracker and leave the invoice out of declarations. The message: "Above ₹10 lakh, your bank decides how to close this entry. Ask about third-party receipt (Reg. 8), or withdraw such payments by SWIFT." **It never blocks an EDF pack.**

### B4. Modules

- **`core`:**
  - `assessDeclaration(draft) → { ok: true, declaration: ReadyDeclaration } | { ok: false, blockers }`. `ReadyDeclaration` is branded like `ReadyPack`.
  - The draft holds: the AD bank, the exporter, the period (a quarter such as `2026-Q4`, or a single invoice id), the eligible invoices with their realisations, confirmed allocations and payment evidence, and the per-invoice reduction choices.
  - **Blockers:** `inrEquivalent` missing or flagged, an invoice over the limit, an unresolved partial or open invoice without a reduction choice, and no eligible invoices.
  - **Rows** contain:
    - the invoice number and date, and the EDF month;
    - the client and currency;
    - the invoice amount, INR equivalent and realised amount;
    - the status: `realised_in_full`, `partly_realised_reduction` or `not_realised_reduction`;
    - the evidence: payment dates and references (the Deel withdrawal reference or FIRA reference) and the receipt mode.
  - Quarters follow calendar boundaries and are labelled with both the calendar quarter and the Indian financial-year quarter, for example "Oct–Dec 2026 (Q3 FY 2026-27)".
- **`packs`:**
  - `renderDeclaration(ready, layoutId) → RenderedPack` produces:
    - the declaration as an A4 PDF, with the exporter block, the AD bank, the regulation reference, the declaration text, the table, and signature, date and place lines;
    - an XLSX of the same rows;
    - a guide.
  - Layouts: `declaration-generic@1`, plus placeholders for ICICI, HDFC and Axis.
  - The declaration text says the exporter declares the invoices "realised either in full or otherwise", with the reduction rows called out under Reg. 6. The guide says the bank *may* close entries on this declaration.
- **`backend`:**
  - Pack use-cases:
    - `getDeclarationState(ctx, {adBankId, period})`: eligible invoices, blockers and warnings;
    - `setReductionChoice(ctx, {invoiceId, choice})`;
    - `generateDeclaration(ctx, {adBankId, period})`;
    - `markDeclarationSubmitted(ctx, {declarationId, ackDocumentId?})`;
    - `getDeclarationDownloads`.
  - **New tables:**
    - `declaration`, mirroring `pack`;
    - `declaration_invoice`;
    - `invoice.reduction_choice`;
    - the `inrEquivalent` field column.
  - Migrations are additive.
- **UI** (shared, in `packages/ui`):
  - A "Declarations" tab per AD bank: pick a quarter, see the eligible invoices and blockers, generate, download, mark submitted.
  - The tracker shows a "Declared closed" status, and the over-limit warning.

### B5. Tracker and calendar

- **New tracker status:** "Closure declared", shown once the declaration covering the invoice is marked submitted.
- **Calendar (`.ics`):** a reminder to file the quarterly declaration on the 10th day after each quarter ends. This is our own default; the regulation sets no deadline.

---

## Sequencing (Sonnet subagents; I review and commit each stage)

1. **In parallel, in worktrees:**
   - (a) the spike (A7);
   - (b) core `assessDeclaration` and packs `renderDeclaration`, which are pure and independent of the spike.
2. **Package split (A2)** and the bundled migrator, plus the `KorraApi` interface and `packages/ui` extraction (A3), with `apps/web` kept green.
3. **`apps/local`:** browser `Deps`, local extractor, manual entry, backup and restore, CSP, `.ics` export, "Export for my CA", "Delete all local data", and e2e tests (the full flow, no request leaving the origin, and the backup round trip).
4. **Declarations end to end:** the db migration, use-cases, and UI in both apps, plus e2e.
5. **Deploy `apps/local` to Vercel** as the public v0. `apps/web` stays undeployed until it's needed.

## Open questions

- **Q-A1. Metrics.** The PRD's kill metric (≥30% of paying users on two or more rails) and the north-star metric need *some* signal. The options:
  - (a) none in v0;
  - (b) anonymous counts with no document content, for example "a pack was generated, with N rails", sent to a first-party endpoint. That needs one tiny server route and has to be stated in the privacy copy;
  - (c) an opt-in "share anonymous usage" toggle.
- **Q-A2. Safari durability.** Record the findings from the spike (A5).
- **Q-B1. Bank formats.** Real declaration formats from ICICI, HDFC and Axis are part of the week-1 bank format collection.
