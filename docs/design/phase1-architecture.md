# Korra Phase 1: architecture and module design

**Status:** v1 · **Date:** 2026-10-06 · **Source PRD:** `docs/prd/2026-10-06-edf-pack.md`

This document is the contract every implementer works from. If code and this doc disagree, fix one of them in the same PR.

---

## 1. Scope

**In Phase 1**
- Onboarding: the exporter profile and AD banks.
- Upload, ingest, review and match for **one rail: Deel**. A generic CSV adapter is also included, so the rail seam is real from the start.
- EDF pack generation per AD bank per month: PDF, XLSX, supporting-docs zip and a submission guide.
- The realisation tracker, plus email notifications through a daily cron.
- Share with my CA: read and download access.
- An audit log of field edits, and account deletion.

**Out of Phase 1**
- Pro billing and plan limits. The `plan` column exists, but nothing enforces it.
- WhatsApp notifications.
- Rails other than Deel, beyond the generic CSV.
- Submission to the bank.
- The CA lead-list dashboard. The query exists; there is no UI.

**Placeholders, called out on purpose**
- The ICICI, HDFC and Axis column layouts and submission guides are **placeholders** until we collect real formats (PRD open question 1).
- The generic layout is the real deliverable.
- Layouts live in versioned config (§7.4), so filling them in later needs no code change.

---

## 2. Domain language

Use these words in code, UI copy and tests.

| Term | Meaning |
|---|---|
| **Exporter** | The user. An Indian freelancer or agency with a PAN, a GSTIN and optionally an IEC. |
| **AD bank** | An Authorised Dealer bank where the exporter files the EDF. An exporter has one or more. |
| **Invoice** | An export invoice issued to a foreign client. Its **invoice month** decides which EDF it belongs to. |
| **Payment** | A single receipt of money for exports, coming from a **rail**. |
| **Rail** | How money reached the exporter: `deel`, or `generic` for any other source in Phase 1. |
| **Receipt mode** | `local_transfer`: the rail's Indian partner bank paid INR. The exporter's bank saw a domestic credit, not a remittance.<br>`swift`: foreign currency was remitted straight to the exporter's AD bank, which issues the FIRA.<br>Deel supports both. |
| **Realising bank** | The bank where the foreign remittance actually landed.<br>For `swift`, it is the exporter's AD bank.<br>For `local_transfer`, it is the rail's partner bank. See open question Q1. |
| **FIRA** | The Foreign Inward Remittance Advice, the bank's proof of an inward remittance. It carries a purpose code. |
| **NOC** | A rail-issued No Objection Certificate. For a Deel SWIFT payout, the exporter's bank needs it before it will issue the FIRC/FIRA. It is a supporting document attached to a payment and bundled into the pack zip. It is not a source of payment facts. |
| **Allocation** | A link saying "X of this payment's amount settles this invoice". Invoices and payments are N:M through allocations. |
| **Match proposal** | The allocations the matcher suggests. The exporter confirms or rejects each one. |
| **Realisation** | When an invoice is fully settled by confirmed allocations.<br>The deadline is invoice date + 9 months, or + 12 months for INR invoices. |
| **EDF pack** | Everything the exporter takes to one AD bank for one month: PDF, XLSX, zip and guide. |
| **Ready pack** | A pack model that has passed every readiness check. Only a ready pack can be rendered. |
| **Field confidence** | The 0–1 confidence the ingester gives each field it extracts. Fields below the threshold are **flagged**. |

---

## 3. Workspace layout and dependency rules

The workspace uses pnpm and turbo, in TypeScript strict mode. Node ≥ 22.

```
apps/
  web/                 Next.js 16 App Router. UI, server actions, route handlers, cron routes.
packages/
  core/                Pure domain: types, matching, realisation, readiness, deadlines, notifications.
  ingest/              Document → extracted records. Rail parsers (deel, generic-csv) + LLM extractor.
  packs/               ReadyPack → files (PDF, XLSX, zip, guide). Bank layouts as versioned JSON.
  db/                  Drizzle schema, migrations, actor-scoped repositories, BlobStore.
  backend/             Use-cases. The only thing apps/web calls for behaviour.
  config/              Shared tsconfig, eslint config.
```

### Allowed imports (enforced)

```
apps/web  ──► backend (server files only), core (types + pure helpers)
backend   ──► core, ingest, packs, db
ingest    ──► core
packs     ──► core
db        ──► core
core      ──► (nothing in the workspace; only zod + date helpers)
```

**Enforcement**
- **dependency-cruiser**, run in CI and in `pnpm lint`:
  - Every package-to-package edge not shown above fails the build.
  - Inside `apps/web`, any file containing `"use client"`, or anything it imports, must not import `@korra/backend`, `@korra/db`, `@korra/ingest` or `@korra/packs`. Only `import type` is allowed.
- **Runtime guards:**
  - Every entry file of `backend`, `db`, `ingest` and `packs` starts with `import "server-only"`.
  - `core` does not, because it is safe in the browser.
- **The backend owns all logic. `apps/web` holds only:**
  - rendering;
  - form parsing that turns `FormData` into backend input, validated with zod schemas exported from `backend`;
  - calling **one** backend use-case per server action.

**What counts as the frontend/backend seam**
- The seam is the `@korra/backend` package interface.
- Server actions and route handlers are adapters onto it, and stay a few lines long.
- If a server action grows an `if` that encodes a business rule, move the rule into backend.

---

## 4. Platform constraints

| Constraint | Consequence |
|---|---|
| **Data in India** (PRD §11) | The Supabase project is in **ap-south-1 (Mumbai)**. `vercel.json` sets `"regions": ["bom1"]`. |
| **LLM calls** | Extraction sends document content to Anthropic, which is outside India. This is a **known tension with PRD §11**.<br>Seek zero-retention terms before public launch.<br>Gate it behind `KORRA_LLM_ENABLED`. CSV parsing stays local.<br>It is a deliberate decision, recorded in [ADR-0001](../adr/0001-llm-extraction-outside-india.md). User-facing copy must say so plainly. |
| **Better Auth, not Supabase Auth** | RLS on `auth.uid()` is unavailable.<br>**All authorization lives in `db` repositories**, scoped by `Actor`.<br>The browser never talks to Supabase. Only the server connects, through the pooler. The anon key is unused, and every table has RLS enabled with no policies (deny-all), as defence in depth. |
| **Vercel body limit of about 4.5 MB** | Files never pass through a function.<br>The server issues a **signed upload URL** for Supabase Storage; the browser PUTs to it, then calls `confirmUpload`. |
| **Function timeouts** | Ingesting runs as an **async job** (§8). The UI polls the document's status. |
| **Serverless PDF** | Use `pdf-lib`, not headless Chrome. Use `exceljs` and `jszip`. |
| **Pooler** | Use `postgres` (postgres-js) with `prepare: false` against the transaction pooler (port 6543). Migrations use the direct URL. |

---

## 5. Shared value types (`@korra/core`)

Every module speaks these types. Define them exactly as written. Money is **integer minor units** plus an ISO 4217 code. FX rates are **decimal strings**. Dates are ISO `YYYY-MM-DD` strings. There are no floats for money anywhere.

```ts
export type Iso4217 = string;                      // "USD", "EUR", "INR"
export type IsoDate = string;                      // "2026-10-31"
export type YearMonth = string;                    // "2026-10"
export interface Money { minor: bigint; currency: Iso4217 }   // bigint, serialised as string at edges

export type RailId = "deel" | "generic";
export type ReceiptMode = "local_transfer" | "swift";

/** A value the ingester produced, or the user edited. */
export interface Field<T> {
  value: T | null;
  confidence: number;          // 0..1. User-set values are 1.
  source: "extracted" | "user" | "default";
}

export interface InvoiceFacts {
  id: string;
  invoiceNo: Field<string>;
  invoiceDate: Field<IsoDate>;
  clientName: Field<string>;
  clientAddress: Field<string>;
  clientCountry: Field<string>;        // ISO 3166-1 alpha-2
  amount: Field<Money>;
  netRealisableValue: Field<Money>;
  contractRef: Field<string>;          // optional field
  serviceDescription: Field<string>;
  sacCode: Field<string>;
  adBankId: Field<string>;             // which pack it goes to; defaults to the profile's default bank
}

export interface PaymentFacts {
  id: string;
  rail: RailId;
  receiptMode: Field<ReceiptMode>;
  date: Field<IsoDate>;
  foreignAmount: Field<Money>;
  inrCredited: Field<Money>;
  fxRate: Field<string>;
  fees: Field<Money>;
  firaRef: Field<string>;
  purposeCode: Field<string>;          // e.g. "P0802"
  payerName: Field<string>;            // client name as the rail reports it, for matching
  realisingBankName: Field<string>;
}

export interface Allocation {
  invoiceId: string;
  paymentId: string;
  amount: Money;                       // in the invoice currency
  score: number;                       // 0..1, from the matcher
  status: "proposed" | "confirmed" | "rejected";
}
```

The required fields are listed in one exported constant, `REQUIRED_FIELDS`, in `core`. It has `exporter` and `invoice` lists, which **block** a pack, and a `payment` list, which only marks a payment incomplete for the **tracker** and never blocks a pack. Readiness (§7.1) and the review UI both use it. They do not keep separate copies.

---

## 6. Module map

| Module | Interface (whole surface) | Hides |
|---|---|---|
| `core/matching` | `proposeMatches(invoices, payments, existing, tolerance?) → MatchProposal` | Scoring, FX/fee tolerance, N:M subset search, and keeping confirmed allocations stable |
| `core/realisation` | `realisationOf(invoice, allocations, asOf) → Realisation` | Deadline math (9/12 months), status machine, outstanding amount |
| `core/readiness` | `assessPack(draft) → { ok: true, pack: ReadyPack } \| { ok: false, blockers }` | Required-field checks on the exporter and invoices, flag checks, invoice documents still processing |
| `core/schedule` | `edfDueDate(month)`, `dueNotifications(state, today) → NotificationIntent[]` | The 10- and 3-day EDF reminders, the 60- and 30-day realisation reminders, dedupe keys |
| `ingest` | `createIngester(deps).ingest(doc) → IngestResult` | Sniffing the file type, choosing a rail parser or the LLM, field confidences, normalisation |
| `packs` | `renderPack(pack: ReadyPack, layoutId) → RenderedPack` | Bank layouts, PDF drawing, XLSX column order, zip assembly, guide templating |
| `db` | `createRepos(db, actor)` returns repos; `BlobStore` | SQL, authorization, the audit log, cascade delete |
| `backend` | Use-case functions (§7.6) | Orchestration across all of the above |

### Why these seams

- **`ReadyPack` is a branded type that only `assessPack` can construct.** `renderPack` accepts only a `ReadyPack`, so the type system enforces "no pack while blockers exist" (PRD §5 acceptance). A UI bug can't get around it.
- **Rail parsers and the LLM sit behind one `ingest` interface.** Callers never decide "CSV or PDF?" Adding Payoneer later means adding one adapter, and no caller changes.
- **Authorization lives inside the repositories**, not in use-cases. A use-case can't forget an ownership check, because there is no unscoped method to call.

---

## 7. Module interfaces in detail

### 7.1 `@korra/core`

```ts
// matching
export interface MatchTolerance {
  amountPct: number;     // default 0.03, covering rail fees and FX spread on foreignAmount vs invoice amount
  dateWindowDays: number;// default: payment between invoiceDate - 7 and invoiceDate + 270
}
export interface MatchProposal {
  allocations: Allocation[];           // existing confirmed and rejected allocations stay as they are; new ones are "proposed"
  unmatchedInvoiceIds: string[];       // still declared; they go to the tracker as Open
  unmatchedPaymentIds: string[];
}
export function proposeMatches(
  invoices: InvoiceFacts[], payments: PaymentFacts[],
  existing: Allocation[], tolerance?: Partial<MatchTolerance>,
): MatchProposal;
```

**Matching rules**
- **Score a pair** using:
  - amount closeness after fees;
  - the same currency (a hard requirement on `foreignAmount.currency === invoice.amount.currency`);
  - client and payer name similarity (normalised token overlap);
  - the date window.
- **Search for allocations:**
  - First, 1:1.
  - Then one payment covering several invoices: a subset sum over that client's unmatched invoices, with a subset of at most 6. Deel withdrawals often batch invoices.
  - Then one invoice covered by several partial payments.
- **Never touch existing allocations:**
  - Confirmed and rejected allocations are never changed.
  - A rejected pair is never proposed again.
  - Amounts already confirmed are subtracted before proposing.
- **Be deterministic:** the same input gives the same output, and ties break by id.

```ts
// realisation
export type RealisationStatus = "open" | "partially_realised" | "realised" | "overdue";
export interface Realisation {
  deadline: IsoDate;                   // invoiceDate + 9 months (INR invoice: + 12)
  status: RealisationStatus;
  realised: Money;                     // sum of confirmed allocations
  outstanding: Money;
}
export function realisationOf(invoice: InvoiceFacts, allocations: Allocation[], asOf: IsoDate): Realisation;
```

**Realisation status**
- An invoice is `realised` when outstanding is at most `amountPct` × amount.
- It is `overdue` when `asOf` is after the deadline and it is not realised. Overdue takes precedence over partial.
- Month arithmetic clamps to the end of the month, so 31 Jan + 9 months gives 31 Oct, and 31 May + 9 months gives 29 Feb in a leap year.

```ts
// readiness
export interface PackDraft {
  month: YearMonth; adBank: AdBank; exporter: ExporterProfile;
  invoices: InvoiceFacts[];
  pendingDocumentIds: string[];        // invoice (or unclassified) documents still ingesting
}
export type Blocker =
  | { kind: "missing_field"; entity: "invoice" | "exporter"; id: string; field: string }
  | { kind: "flagged_field"; entity: "invoice"; id: string; field: string; confidence: number }
  | { kind: "document_pending"; documentId: string }      // only invoice-kind documents (or not-yet-classified ones)
  | { kind: "no_invoices" };
declare const ready: unique symbol;
export type ReadyPack = PackDraft & { readonly [ready]: true; generatedAt: string; rows: EdfRow[] };
export const FLAG_THRESHOLD = 0.9;
export function assessPack(draft: PackDraft, now: Date): { ok: true; pack: ReadyPack } | { ok: false; blockers: Blocker[] };
```

**Readiness rules**
- **The EDF is an invoice declaration, not a payment document.** FEMA 23(R)/2026-RB Reg. 3(2) asks for "the amount representing the full export value of services", due within 30 days of the end of the invoice month. Realisation is tracked separately in EDPMS by the AD bank (Reg. 18).
  - So readiness depends **only** on the exporter profile and the invoice fields.
  - Payments, allocations and FIRAs **never** block a pack. They feed the realisation tracker (Feature 2).
- `EdfRow` is one declared invoice, flattened together with the exporter columns. It has **no payment columns**. It is the single row model that every layout renders.
- Only invoices in `draft.month` whose `adBankId` matches `draft.adBank.id` are included.
- Unpaid invoices are included, with empty payment columns.

```ts
// schedule
export function edfDueDate(month: YearMonth): IsoDate;              // last day of month + 30 days
export interface NotificationIntent { userId: string; kind: "edf_due" | "realisation_due"; dedupeKey: string; vars: Record<string, string> }
export function dueNotifications(state: ScheduleState, today: IsoDate): NotificationIntent[];
```

**Notification schedule**
- `edf_due` fires 10 and 3 days before `edfDueDate` for each month that has declared invoices and no pack marked submitted.
- `realisation_due` fires 60 and 30 days before each non-realised invoice's deadline.
- The `dedupeKey` (for example, `edf_due:2026-10:d10`) makes sending idempotent.

### 7.2 `@korra/ingest`

```ts
export interface IngestDoc { bytes: Uint8Array; mimeType: string; filename: string; hint?: "invoice" | "statement" | "fira" | "noc" }
export interface IngestResult {
  kind: "invoice" | "statement" | "fira" | "noc" | "unknown";
  nocRef?: { reference: string | null; amount: Money | null; date: IsoDate | null };   // set when kind === "noc", used to link the NOC to a payment
  rail: RailId | null;
  invoices: Omit<InvoiceFacts, "id" | "adBankId">[];
  payments: Omit<PaymentFacts, "id">[];
  warnings: string[];
}
export interface LlmExtractor { extract(doc: IngestDoc): Promise<IngestResult> }   // internal seam
export function createIngester(deps: { llm: LlmExtractor }): { ingest(doc: IngestDoc): Promise<IngestResult> };
export function createClaudeExtractor(opts: { apiKey: string; model?: string }): LlmExtractor;
export function createFakeExtractor(fixtures: Record<string, IngestResult>): LlmExtractor;   // keyed by filename
```

**Routing**
- CSV and XLSX go to the rail parsers. Each one has `detect(headers) → score`, and the highest score wins.
  - The **Deel** parser maps Deel's transaction export. Both receipt modes are supported:
    - `local_transfer`: `inrCredited` is set, with no `firaRef`.
    - `swift`: foreign currency arrives at the user's bank, and `firaRef` comes from a later FIRA upload.
    - Header names are matched through an alias table, because the real Deel export format is still unconfirmed (Q2). If a required column is missing, the parser warns and does not throw.
  - Otherwise, the **generic** parser maps a documented template.
- PDF and image files go to the `LlmExtractor`.
  - That covers invoices, including Deel-generated invoice PDFs, as well as FIRA PDFs and Deel withdrawal receipts.
  - A FIRA is returned as a `payment` with `firaRef` and `purposeCode` set. Backend merges it into an existing payment if the amount, date and currency agree (§7.6).
  - An NOC is returned as `kind: "noc"` with `nocRef`, and with no invoices or payments. Backend links the document to the matching payment (`payment.noc_document_id`). If nothing matches, the user links it by hand in review. Linked NOCs go into the supporting zip.
- Parsers fill `confidence`:
  - Exact CSV values get 1.
  - Values that needed heuristics, such as date format guessing, get 0.7.
  - The LLM reports per-field confidence through its structured output.

**Claude extractor**
- Use the `claude-api` skill before writing it.
- Use structured outputs (`output_config.format` of type `json_schema`), not forced tool use (Sonnet 5.5 takes no forced `tool_choice`).
- Default model: `claude-sonnet-5-5`.
- Send no PII beyond the document itself.
- Respect `KORRA_LLM_ENABLED`. When it is disabled, return `kind: "unknown"` with a warning.

### 7.3 `@korra/db`

```ts
export type Actor = { userId: string; role: "owner" } | { userId: string; role: "ca"; ownerUserId: string };
export function createDb(url: string): Db;
export function createRepos(db: Db, actor: Actor): Repos;
```

**Repos, grouped by resource.** Every method is scoped to the actor's data.

- **Exporter profile and AD banks**
  - `profile.get`, `profile.upsert`
  - `banks.list`, `banks.upsert`
- **Documents**
  - `documents.create`, `documents.list(month?)`, `documents.setStatus` (entering `ingesting` counts an attempt), `documents.requeueStuck(olderThan, maxAttempts)` (owner-scoped)
  - kinds: `invoice | statement | fira | noc | ack | unknown`
- **Invoices and payments**
  - `invoices.listByMonth`, `invoices.insertExtracted`, `invoices.updateField(id, field, value)`. That last method writes the audit row in the same transaction.
  - `payments.*`, which mirrors invoices.
- **Allocations**
  - `allocations.list`, `allocations.upsertProposed`, `allocations.setStatus`
- **Packs**
  - `packs.create`, `packs.list`, `packs.markSubmitted(id, ackDocumentId?)`
- **CA shares**
  - `shares.invite`, `shares.accept(token)`, `shares.listForCa`, `shares.revoke`
- **Account deletion**
  - `account.deleteAll()`: a cascading delete, plus it returns the blob keys to purge.

**Access rules**
- A `ca` actor is read-only. Any write throws `ForbiddenError`.
- The CA sees only data owned by `ownerUserId`, and only while an accepted, non-revoked share exists. The repository checks this on every call.

```ts
export interface BlobStore {
  createUploadUrl(key: string, mimeType: string): Promise<{ url: string; token: string }>;
  get(key: string): Promise<Uint8Array>;
  put(key: string, bytes: Uint8Array, mimeType: string): Promise<void>;
  createDownloadUrl(key: string, ttlSeconds: number): Promise<string>;
  delete(keys: string[]): Promise<void>;
}
export function createSupabaseBlobStore(opts: { url: string; serviceRoleKey: string; bucket: string }): BlobStore;
export function createMemoryBlobStore(): BlobStore;
```

Blob keys look like `u/{userId}/{documentId}/{filename}`.

**Schema**
- Drizzle, in `packages/db/src/schema.ts`.
- The Better Auth tables (`user`, `session`, `account`, `verification`) are generated by the Better Auth CLI into the same schema.
- **Domain tables:**
  - `exporter_profile`
  - `ad_bank`, with name and AD code
  - `document`, with `status: uploaded|ingesting|ingested|failed`, `kind`, `month`, `blob_key`, `attempts` and `error`
  - `invoice` and `payment`, where each fact is a JSONB `Field<T>` column for each field. The `month` and `ad_bank_id` columns are denormalised for querying.
  - `allocation`
  - `payment.noc_document_id` (nullable), for the supporting NOC
  - `pack`
  - `field_edit` (the audit log: entity, id, field, old, new, actor and at)
  - `ca_share`
  - `notification_log`, with a unique `dedupe_key`
- Every table has RLS enabled and no policies.

### 7.4 `@korra/packs`

```ts
export interface RenderedPack { files: { name: string; mimeType: string; bytes: Uint8Array }[] }
export function renderPack(pack: ReadyPack, layoutId: string, supportingDocs: { name: string; bytes: Uint8Array }[]): Promise<RenderedPack>;
export function listLayouts(): { id: string; bankName: string; version: string; placeholder: boolean }[];
```

**Output files:** `EDF-{bank}-{YYYY-MM}.pdf` (A4), `EDF-{bank}-{YYYY-MM}.xlsx`, `supporting-{YYYY-MM}.zip` and `HOW-TO-SUBMIT-{bank}.md`.

**Layouts**
- Each layout is a file in `packages/packs/layouts/{id}@{version}.json`. It holds the column list as `EdfRow` key paths with headers, plus the guide markdown.
- The available layouts are `generic`, `icici`, `hdfc` and `axis`. ICICI, HDFC and Axis carry `"placeholder": true`, and the UI shows a warning for them.

### 7.5 Ingest job model

1. The browser asks for an upload URL. The backend creates the `document` row with status `uploaded`.
2. The browser PUTs the file to Storage, then calls `confirmUpload(documentId)`.
3. `confirmUpload` returns `{ documentId, ingest }`. For `ack` documents (signed bank acknowledgements) it marks them `ingested` and `ingest` is false. Otherwise it sets the status to `ingesting`, and the server action schedules `runIngest(deps, documentId)` with Next's `after()`.
4. `runIngest` loads the blob, calls `ingest`, inserts invoices and payments, merges any FIRA, re-runs `proposeMatches` for the month, and sets the status to `ingested` (or `failed`, with an error).
5. Retries: Vercel Hobby only allows daily crons (±59 min), so `/api/cron/sweep` runs once a day as a backstop. It re-queues documents `ingesting` for more than 10 minutes (`STUCK_AFTER_MS`), up to 3 attempts (`MAX_INGEST_ATTEMPTS`). Opportunistically, the owner-only month page calls `requeueStuckIngests(ctx)`, which atomically re-enters `ingesting` (one attempt per retry, timer restarted), fails exhausted documents and returns the ids to run with `after()`.
6. The UI polls `getMonthState` every 3 seconds while any document is pending.

### 7.6 `@korra/backend`

The backend is the only interface `apps/web` uses for behaviour. Every function takes a `Ctx` first.

```ts
export interface Deps { db: Db; blobs: BlobStore; ingester: Ingester; mailer: Mailer; clock: () => Date; appUrl: string; authSecret: string; authUrl: string }   // auth* feed createAuth
export interface Ctx { deps: Deps; actor: Actor }
export function createDeps(env: Env): Deps;     // the real adapters; tests build Deps with fakes
export class ForbiddenError, NotFoundError, ValidationError
```

**Use-cases, grouped by area**

- **Onboarding**
  - `getOnboarding(ctx)`
  - `saveProfile(ctx, input)`
  - `saveBank(ctx, input)`
- **Uploads and ingest**
  - `requestUpload(ctx, { filename, mimeType, month, hint? }) → { documentId, uploadUrl, token }` (`hint` may be `ack`)
  - `confirmUpload(ctx, documentId) → { documentId, ingest }`
  - `listDocuments(ctx, month?)`
  - `requeueStuckIngests(ctx) → string[]` (owner-scoped, see §7.5)
  - `runIngest(deps, documentId)`: a system call, not an actor call
  - `sweepStuckIngests(deps)`
- **Review and matching**
  - `getMonthState(ctx, month) → { documents, invoices, payments, allocations, realisations, blockersByBank }`
  - `editField(ctx, { entity, id, field, value })`
  - `decideAllocation(ctx, { invoiceId, paymentId, decision })`
  - `linkNoc(ctx, { paymentId, documentId })`
- **Packs**
  - `generatePack(ctx, { month, adBankId }) → { ok: true, packId } | { ok: false, blockers }`
  - `getPackDownloads(ctx, packId)`
  - `markPackSubmitted(ctx, { packId, ackDocumentId? })`
  - `listPacks(ctx, month?)`, `layoutIdFor(bankName)`, `isPlaceholderLayout(layoutId)`
- **Tracker and notifications**
  - `getTracker(ctx) → { totals: { outstanding, due60, overdue }, rows }`
  - `runDailyNotifications(deps)`: a system call
- **CA sharing**
  - `inviteCa(ctx, email)`
  - `getCaInvite(ctx, token)` and `acceptCaInvite(ctx, token)`
  - `listCaClients(ctx)` (the CA's clients) and `listMyCas(ctx)` (the owner's shares)
  - `revokeCa(ctx, shareId)`
- **Account**
  - `deleteAccount(ctx)`

Every use-case input has a zod schema exported next to it, named `saveProfileInput` and so on. Server actions parse `FormData` with these schemas.

**Entry points.** `@korra/backend` is server-only. `@korra/backend/schemas` is a client-safe entry (zod input schemas, no server code). `@korra/backend/testing` builds `Deps` from PGlite, memory blobs, a fake extractor, a memory mailer and a settable clock (`createTestDeps`, `createTestOwner`, `caCtx`). `@korra/db/testing` exposes the PGlite test database and the memory blob store.

The `Mailer` port has `send({ to, subject, text, html })`, with a Resend adapter and a console fake. Better Auth's emails (verification, password reset) go through the same `Mailer`.

### 7.7 `apps/web`

**Auth**
- Better Auth with email and password and email verification lives in **`@korra/backend`**: `createAuth(deps)`, `getOwnerCtx(deps, headers)` and `getCaCtx(deps, headers, ownerUserId)`. It uses the Drizzle adapter on `@korra/db`, and its emails go through the `Mailer`.
- `apps/web` only mounts it: `api/auth/[...all]` with the `nextCookies` plugin, and `src/server/ctx.ts` (`ownerCtx`, `caCtx`) wraps the backend helpers with the request headers.
- The repos verify the CA share on every call.
- Dev in-memory mode: `KORRA_DEV_INMEMORY=1` (ignored in production) swaps in PGlite, memory blobs, a console mailer and a fake extractor, with `/api/dev-upload` and `/api/dev-mail` stand-ins. Documented in the README.

**Routes**
- `(auth)/sign-in`, `(auth)/sign-up`
- `onboarding`
- `months/[month]`: upload, review and match, with blockers per bank and a generate button
- `packs/[id]`
- `tracker`
- `settings`: banks, CA sharing, delete account
- `ca`: the client list, then `ca/[ownerId]/...` for read-only views of the same pages
- `api/auth/[...all]`
- `api/cron/sweep` (daily backstop) and `api/cron/notify` (daily): both cron routes check `Authorization: Bearer ${CRON_SECRET}`

**Components and visual style**
- Server components fetch through backend. Client components receive plain serialisable props, with bigint converted to string.
- Use Tailwind v4.
- Keep the design system minimal: a calm, document-centric, utilitarian look.

**Disclaimer**
- Show the disclaimer from PRD §11 in the footer and on the pack page.

---

## 8. Testing strategy

- **`core`**
  - Unit tests through the public functions only, using Vitest.
  - Matching has table-driven cases for 1:1, N:1 batch withdrawal, 1:N partials, cross-currency rejection, rejected-pair memory and determinism.
  - Realisation covers month-end clamping and INR invoices at 12 months.
- **`ingest`**
  - Fixture CSVs in `packages/ingest/fixtures/` for Deel (both receipt modes) and generic.
  - The LLM path is tested with `createFakeExtractor`.
  - One opt-in live test, `KORRA_LIVE_LLM=1`.
- **`packs`**
  - Render a fixture `ReadyPack`. Re-read the XLSX with exceljs and assert the column order.
  - Assert that the PDF is A4: 595×842 pt.
  - Assert the zip's entries.
- **`db`**
  - Integration tests against local Supabase (`supabase start`) or `DATABASE_URL`. They are skipped when no DB is set.
  - Authorization tests: CA cannot write, revoked CA cannot read, and a different owner is invisible.
- **`backend`**
  - Use-case tests with `Deps` built from the memory blob store, fake ingester, fake mailer, a fixed clock and the test DB.
- **`apps/web`**
  - A typecheck and build, plus `pnpm e2e`: a Playwright smoke test (not part of `pnpm test`) in dev in-memory mode covering sign-up, onboarding, upload of the Deel CSV fixture, review, generate, download, tracker and CA sharing.

**Commands**
- From the repo root: `pnpm test`, `pnpm lint` (eslint plus dependency-cruiser), `pnpm typecheck` and `pnpm build`.

---

## 9. Environment variables

```
DATABASE_URL            # Supabase transaction pooler (6543), prepare:false
DATABASE_URL_DIRECT     # migrations
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_BUCKET=documents
BETTER_AUTH_SECRET
BETTER_AUTH_URL
RESEND_API_KEY          # unset → console mailer
                        # (DATABASE_URL_DIRECT and KORRA_LLM_ENABLED are read outside the backend env schema)
MAIL_FROM
ANTHROPIC_API_KEY
KORRA_LLM_ENABLED=true
CRON_SECRET
APP_URL
```

---

## 10. Open questions

| # | Question | Current assumption |
|---|---|---|
| Q1 | Deel `local_transfer` payouts vs EDPMS closure | **Resolved** in `docs/research/2026-10-06-deel-local-transfer-edpms.md`. The EDF goes to the exporter's own AD bank. For invoices up to ₹10 lakh, the entry closes on the exporter's declaration (Reg. 4(2) proviso, can be filed quarterly in bulk). Above ₹10 lakh, the bank decides (third-party receipt, Reg. 8) or the exporter withdraws by SWIFT. Follow-up feature: a realisation declaration pack. |
| Q2 | What are the exact Deel transaction export columns? | Columns are matched through an alias table. **A real sample export is needed**, and the parser is updated when we have one. |
| Q3 | ICICI, HDFC and Axis formats | Placeholder layouts. PRD open question 1. |
| Q4 | LLM data residency vs PRD §11 | Allowed with a kill switch; zero-retention terms to be sought before public launch. See ADR-0001. |
