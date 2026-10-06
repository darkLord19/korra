// Browser-side spike: PGlite on IndexedDB + the real backend use-cases. Loaded with a dynamic import() from
// the page so the initial route JS stays small and nothing here runs during prerender.
import { PGlite, type PGliteInterface } from "@electric-sql/pglite";
import { PGliteWorker } from "@electric-sql/pglite/worker";
import { assessPack, money, type ExporterProfile, type InvoiceFacts, type PackDraft } from "@korra/core";
import {
  confirmUpload,
  getMonthState,
  getOnboarding,
  requestUpload,
  runIngest,
  saveBank,
  saveProfile,
  type Ctx,
  type Deps,
} from "@korra/backend";
import { createBrowserDb } from "@korra/db/browser";
import { createMemoryBlobStore, schema, type Db, type MemoryBlobStore } from "@korra/db";
import { createFakeExtractor, createIngester } from "@korra/ingest";
import { renderPack } from "@korra/packs";
import { sql } from "drizzle-orm";
import { DEEL_CSV } from "./fixture.generated";

export const DB_NAME = "korra-spike";
const OWNER_ID = "local-owner";
const BANK_ID = "bank-hdfc";

export interface Booted {
  pg: PGliteInterface & { dumpDataDir(c?: "none" | "gzip" | "auto"): Promise<File | Blob> };
  db: Db;
  blobs: MemoryBlobStore;
  deps: Deps;
  ctx: Ctx;
  timings: { bootMs: number; firstQueryMs: number; migrateMs: number; seedMs: number; migrations: { applied: string[]; skipped: string[] } };
}

const now = () => performance.now();
const g = globalThis as unknown as { __korraBoot?: Promise<Booted> };

/** One instance per tab: memoised promise, so StrictMode / double clicks never open two PGlites on one store. */
export function boot(name = DB_NAME): Promise<Booted> {
  g.__korraBoot ??= doBoot(name);
  return g.__korraBoot;
}

async function doBoot(name: string): Promise<Booted> {
  const t0 = now();
  const useWorker = new URLSearchParams(location.search).get("mode") === "worker";
  const pg = (useWorker
    ? new PGliteWorker(new Worker(new URL("./pglite.worker.ts", import.meta.url), { type: "module" }), { dataDir: `idb://${name}` })
    : new PGlite(`idb://${name}`, { relaxedDurability: true })) as unknown as Booted["pg"];
  await pg.waitReady;
  const t1 = now();
  await pg.query("select 1");
  const t2 = now();
  const { db, migrate } = await createBrowserDb(pg);
  const t3 = now();
  // Idempotent local owner (fixed id so reloads act as the same actor).
  await db
    .insert(schema.user)
    .values({ id: OWNER_ID, email: "owner@local.invalid", name: "Local owner" })
    .onConflictDoNothing();
  const t4 = now();
  const blobs = createMemoryBlobStore();
  const deps: Deps = {
    db,
    blobs,
    ingester: createIngester({ llm: createFakeExtractor({}) }),
    mailer: { send: async () => undefined },
    clock: () => new Date(),
    appUrl: "http://localhost",
    authSecret: "local-not-used-local-not-used-local-not-used",
    authUrl: "http://localhost",
  };
  const ctx: Ctx = { deps, actor: { userId: OWNER_ID, role: "owner" } };
  return {
    pg,
    db,
    blobs,
    deps,
    ctx,
    timings: { bootMs: t1 - t0, firstQueryMs: t2 - t1, migrateMs: t3 - t2, seedMs: t4 - t3, migrations: migrate },
  };
}

export async function readPersisted() {
  const t0 = now();
  const b = await boot();
  const t1 = now();
  const onboarding = await getOnboarding(b.ctx);
  return { ...b.timings, timeToBootedMs: t1 - t0, getOnboardingMs: now() - t1, onboarding };
}

export async function saveNamedBank(name: string) {
  const b = await boot();
  const t = now();
  const bank = await saveBank(b.ctx, { name, adCode: `AD-${name}` });
  return { bank, ms: now() - t, banks: (await getOnboarding(b.ctx)).banks.map((x) => x.name) };
}

const exporter: ExporterProfile = {
  legalName: "Jane Dev",
  address: "12 MG Road, Pune",
  pan: "ABCDE1234F",
  gstin: "27ABCDE1234F1Z5",
  iec: null,
  defaultSacCodes: ["998314"],
  defaultAdBankId: BANK_ID,
};

const f = <T>(value: T) => ({ value, confidence: 1, source: "user" as const });
function invoice(i: number): InvoiceFacts {
  const amount = money(150000 * i, "USD");
  return {
    id: `inv-${i}`,
    invoiceNo: f(`INV-2026-${i}`),
    invoiceDate: f("2026-09-05"),
    clientName: f("Acme Corp"),
    clientAddress: f("1 Main St, NYC"),
    clientCountry: f("US"),
    amount: f(amount),
    netRealisableValue: f(amount),
    contractRef: { value: null, confidence: 1, source: "user" },
    serviceDescription: f("Software development services"),
    sacCode: f("998314"),
    adBankId: f(BANK_ID),
    inrEquivalent: { value: null, confidence: 0, source: "default" },
  };
}

export async function runFull() {
  const out: Record<string, unknown> = {};
  const b = await boot();
  out.boot = b.timings;
  const { ctx, deps } = b;

  let t = now();
  const bank = await saveBank(ctx, { id: BANK_ID, name: "HDFC Bank", adCode: "0001234" });
  await saveProfile(ctx, { ...exporter, iec: null });
  out.onboarding = await getOnboarding(ctx);
  out.onboardingMs = now() - t;

  // Upload flow against the in-memory blob store: requestUpload -> "browser PUT" -> confirm -> ingest.
  const bytes = new TextEncoder().encode(DEEL_CSV);
  t = now();
  const up = await requestUpload(ctx, { filename: "deel.csv", mimeType: "text/csv", sizeBytes: bytes.byteLength, month: "2026-09" });
  b.blobs.completeUpload(up.token, bytes);
  const conf = await confirmUpload(ctx, up.documentId);
  out.uploadMs = now() - t;
  t = now();
  await runIngest(deps, up.documentId);
  out.runIngestMs = now() - t;
  t = now();
  const month = await getMonthState(ctx, "2026-09");
  out.getMonthStateMs = now() - t;
  out.confirm = conf;
  out.payments = month.payments.length;
  out.documents = month.documents.map((d) => ({ f: d.filename, status: d.status }));

  // renderPack on a ReadyPack from core's assessPack (hand-built valid draft).
  const draft: PackDraft = {
    month: "2026-09",
    adBank: bank,
    exporter,
    invoices: [invoice(1), invoice(2)],
    pendingDocumentIds: [],
  };
  const assessed = assessPack(draft, new Date());
  if (!assessed.ok) throw new Error("draft not ready: " + JSON.stringify(assessed.blockers, (_, v) => (typeof v === "bigint" ? String(v) : v)));
  t = now();
  const rendered = await renderPack(assessed.pack, "generic", []);
  out.renderPackMs = now() - t;
  const pdf = rendered.files.find((x) => x.name.endsWith(".pdf"))!;
  out.renderedFiles = rendered.files.map((x) => ({ name: x.name, bytes: x.bytes.byteLength }));
  const pdfBytes = new Uint8Array(pdf.bytes);
  const url = URL.createObjectURL(new Blob([pdfBytes], { type: "application/pdf" }));
  return { out, pdfUrl: url, pdfName: pdf.name, pdfBytes };
}

/** Backup round trip: dump the data dir, load it into a fresh in-memory instance, compare. */
export async function backupRoundTrip() {
  const b = await boot();
  let t = now();
  const dump = await b.pg.dumpDataDir("gzip");
  const dumpMs = now() - t;
  t = now();
  const copy = new PGlite("memory://", { loadDataDir: dump });
  await copy.waitReady;
  const loadMs = now() - t;
  const q = async (c: PGliteInterface) =>
    (await c.query<{ n: number }>("select count(*)::int n from ad_bank")).rows[0]!.n +
    "/" +
    (await c.query<{ n: number }>("select count(*)::int n from payment")).rows[0]!.n +
    "/" +
    (await c.query<{ n: number }>("select count(*)::int n from document")).rows[0]!.n;
  const original = await q(b.pg);
  const restored = await q(copy);
  const migs = (await copy.query<{ tag: string }>('select tag from "__korra_migrations" order by tag')).rows.map((r) => r.tag);
  await copy.close();
  return { dumpBytes: dump.size, dumpType: dump.type, dumpMs, loadMs, original, restored, equal: original === restored, migs };
}

export async function rowCounts() {
  const b = await boot();
  return ((await b.db.execute(sql`select (select count(*) from ad_bank)::int banks, (select count(*) from payment)::int payments`)) as unknown as { rows: unknown[] }).rows[0];
}
