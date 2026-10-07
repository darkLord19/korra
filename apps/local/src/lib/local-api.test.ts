import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "@korra/backend";
import { createLocalDeps } from "@korra/backend/browser";
import { createTestDeps, createTestOwner, type TestDeps } from "@korra/backend/testing";
import { KorraApiError, UNSUPPORTED_FILE_MESSAGE } from "@korra/ui";
import { createIngestRunner } from "./ingest-runner";
import { call, createLocalApi } from "./local-api";
import { trackBlobs } from "./tracked-blobs";

const DEEL_CSV = readFileSync(fileURLToPath(new URL("../../../../packages/ingest/fixtures/deel/synthetic-transactions.csv", import.meta.url)));
const csvFile = () => new File([DEEL_CSV], "synthetic-transactions.csv", { type: "text/csv" });

/** Test deps whose ingester can be held back, to prove uploadFile does not wait for ingest. */
async function setup(opts: { runner?: "real" | "never"; onPackGenerated?: () => void } = {}) {
  const base: TestDeps = await createTestDeps();
  const blobs = trackBlobs(base.blobs, () => undefined);
  const real = base.ingester;
  let hold: Promise<void> | null = null;
  const ingestCalls: string[] = [];
  const deps: TestDeps = {
    ...base,
    blobs: blobs as unknown as TestDeps["blobs"],
    ingester: { ingest: async (doc) => { ingestCalls.push(doc.filename); await hold; return real.ingest(doc); } },
  };
  const { ctx } = await createTestOwner(deps);
  const runner = createIngestRunner(deps, ctx, opts.runner === "never" ? async () => undefined : undefined);
  const local = createLocalApi({ ctx, blobs, ingest: runner, resumeEveryMs: 0, ...(opts.onPackGenerated ? { onPackGenerated: opts.onPackGenerated } : {}) });
  return {
    ...local,
    deps,
    ingestCalls,
    holdIngest() {
      let open!: () => void;
      hold = new Promise<void>((r) => { open = r; });
      return open;
    },
  };
}

describe("call (error parity with the web server actions)", () => {
  it("turns domain errors into KorraApiErrors using the shared classifier", async () => {
    const v = await call(async () => { throw new ValidationError("legalName: Required; pan: Invalid PAN"); }).catch((e: unknown) => e);
    expect(v).toBeInstanceOf(KorraApiError);
    expect(v).toMatchObject({ kind: "validation", message: "legalName: Required; pan: Invalid PAN", fieldErrors: { legalName: "Required", pan: "Invalid PAN" } });
    await expect(call(async () => { throw new NotFoundError("AD bank not found"); })).rejects.toMatchObject({ kind: "not_found", message: "AD bank not found" });
  });

  it("hides unexpected errors behind the generic message and logs them", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(call(async () => { throw new Error("db exploded: secret detail"); })).rejects.toMatchObject({ kind: "unknown", message: "Something went wrong. Try again." });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("passes a KorraApiError through untouched", async () => {
    const e = new KorraApiError({ kind: "validation", message: "x" });
    await expect(call(async () => { throw e; })).rejects.toBe(e);
  });
});

describe("local KorraApi", () => {
  it("declares what the local app can do", async () => {
    expect((await setup()).api.capabilities).toEqual({ caSharing: false, accountDeletion: "local", backup: true });
  });

  it("rejects an unsupported file type before storing anything", async () => {
    const { api } = await setup();
    await expect(api.uploadFile(new File(["x"], "notes.txt", { type: "text/plain" }), { month: "2026-09" })).rejects.toMatchObject({ kind: "validation", message: UNSUPPORTED_FILE_MESSAGE });
    expect(await api.listDocuments("2026-09")).toEqual([]);
  });

  it("uploadFile resolves as soon as the file is stored; ingest runs in the background and the screens poll", async () => {
    const t = await setup();
    const release = t.holdIngest();
    const { documentId } = await t.api.uploadFile(csvFile(), { month: "2026-09" });
    // Stored and confirmed, ingest started but still held: the document is "ingesting", nothing is read yet.
    let month = await t.api.getMonthState("2026-09");
    expect(month.documents).toMatchObject([{ id: documentId, status: "ingesting" }]);
    expect(month.payments).toHaveLength(0);
    release();
    await vi.waitFor(async () => {
      month = await t.api.getMonthState("2026-09");
      expect(month.documents[0]).toMatchObject({ id: documentId, status: "ingested", kind: "statement" });
    });
    expect(month.payments).toHaveLength(3);
    expect(t.ingestCalls).toEqual(["synthetic-transactions.csv"]);
  });

  it("an acknowledgement (hint ack) is stored but never ingested", async () => {
    const t = await setup();
    const { documentId } = await t.api.uploadFile(new File([new Uint8Array([37, 80, 68, 70])], "ack.pdf", { type: "application/pdf" }), { month: "2026-09", hint: "ack" });
    expect((await t.api.listDocuments("2026-09"))[0]).toMatchObject({ id: documentId, status: "ingested", kind: "ack" });
    await new Promise((r) => setTimeout(r, 20));
    expect(t.ingestCalls).toEqual([]);
  });

  it("validation failures from the use-cases arrive as KorraApiErrors", async () => {
    const { api } = await setup();
    await expect(api.saveProfile({ legalName: "", address: "", pan: "bad", gstin: "bad" } as never)).rejects.toBeInstanceOf(KorraApiError);
    await expect(api.getPackDownloads("no-such-pack")).rejects.toBeInstanceOf(KorraApiError);
  });

  it("tells the app when a pack was generated, and only then", async () => {
    const onPackGenerated = vi.fn();
    const { api } = await setup({ onPackGenerated });
    const bank = await api.saveBank({ name: "Acme Test Bank", adCode: "6390001" });
    await api.saveProfile({ legalName: "Jane Dev", address: "12 MG Road, Bengaluru", pan: "ABCDE1234F", gstin: "29ABCDE1234F1Z5", defaultSacCodes: ["998314"], defaultAdBankId: bank.id });
    await api.uploadFile(csvFile(), { month: "2026-09" });
    await vi.waitFor(async () => expect((await api.getMonthState("2026-09")).payments).toHaveLength(3));

    // An unknown bank fails; a month with no invoice is blocked: neither is a generated pack.
    await expect(api.generatePack({ month: "2026-09", adBankId: "nope" })).rejects.toBeInstanceOf(KorraApiError);
    expect(await api.generatePack({ month: "2026-09", adBankId: bank.id })).toMatchObject({ ok: false });
    expect(onPackGenerated).not.toHaveBeenCalled();

    const { id } = await api.createInvoiceManually({
      month: "2026-09",
      fields: {
        invoiceNo: "INV-77", invoiceDate: "2026-09-05", clientName: "Acme Corp", clientAddress: "1 Main St, New York", clientCountry: "US",
        amount: { minor: "150000", currency: "USD" }, netRealisableValue: { minor: "150000", currency: "USD" }, serviceDescription: "Software development services", sacCode: "998314",
      },
    });
    const month = await api.getMonthState("2026-09");
    const proposal = month.allocations.find((a) => a.invoiceId === id)!;
    await api.decideAllocation({ invoiceId: id, paymentId: proposal.paymentId, decision: "confirm" });
    expect(await api.generatePack({ month: "2026-09", adBankId: bank.id })).toMatchObject({ ok: true });
    expect(onPackGenerated).toHaveBeenCalledTimes(1);
  });

  it("a failing listener never fails the pack call", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { api } = await setup({ onPackGenerated: () => { throw new Error("listener"); } });
    const bank = await api.saveBank({ name: "Acme Test Bank", adCode: "6390001" });
    await api.saveProfile({ legalName: "Jane Dev", address: "12 MG Road, Bengaluru", pan: "ABCDE1234F", gstin: "29ABCDE1234F1Z5", defaultSacCodes: ["998314"], defaultAdBankId: bank.id });
    await api.uploadFile(csvFile(), { month: "2026-09" });
    await vi.waitFor(async () => expect((await api.getMonthState("2026-09")).payments).toHaveLength(3));
    const { id } = await api.createInvoiceManually({
      month: "2026-09",
      fields: {
        invoiceNo: "INV-78", invoiceDate: "2026-09-05", clientName: "Acme Corp", clientAddress: "1 Main St, New York", clientCountry: "US",
        amount: { minor: "150000", currency: "USD" }, netRealisableValue: { minor: "150000", currency: "USD" }, serviceDescription: "Software development services", sacCode: "998314",
      },
    });
    const proposal = (await api.getMonthState("2026-09")).allocations.find((a) => a.invoiceId === id)!;
    await api.decideAllocation({ invoiceId: id, paymentId: proposal.paymentId, decision: "confirm" });
    expect(await api.generatePack({ month: "2026-09", adBankId: bank.id })).toMatchObject({ ok: true });
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });

  it("reads PDFs with the local rules, and an invoice without a SAC takes the last used one (same applyResult as the web app)", async () => {
    // The browser's real ingester (rules over a text layer), with the text layer read from the bytes instead of pdf.js.
    const base = await createTestDeps();
    const blobs = trackBlobs(base.blobs, () => undefined);
    const deps: TestDeps = { ...base, blobs: blobs as unknown as TestDeps["blobs"], ingester: createLocalDeps({ db: base.db, blobs, getTextLayer: async (b) => new TextDecoder().decode(b).split("\n").slice(1) }).ingester };
    const { ctx } = await createTestOwner(deps);
    const { api } = createLocalApi({ ctx, blobs, ingest: createIngestRunner(deps, ctx), resumeEveryMs: 0 });
    const pdf = (name: string, no: string, sac: string) =>
      new File([`%PDF-1.4\nInvoice No: ${no}\nInvoice Date: 2026-09-02\nBill To: Acme Corp\n1 Main St, New York, United States\nSoftware development ${sac}\nTotal: $1,500.00\n`], name, { type: "application/pdf" });
    await api.uploadFile(pdf("a.pdf", "INV-A1", "SAC 998313"), { month: "2026-09" });
    await vi.waitFor(async () => expect((await api.getMonthState("2026-09")).invoices).toHaveLength(1));
    await api.uploadFile(pdf("b.pdf", "INV-B2", ""), { month: "2026-09" });
    await vi.waitFor(async () => expect((await api.getMonthState("2026-09")).invoices).toHaveLength(2));
    const month = await api.getMonthState("2026-09");
    expect(month.invoices.find((i) => i.invoiceNo.value === "INV-A1")!.sacCode).toMatchObject({ value: "998313", source: "extracted" });
    expect(month.invoices.find((i) => i.invoiceNo.value === "INV-B2")!.sacCode).toEqual({ value: "998313", confidence: 0.7, source: "default" });
  });

  it("a document a closed tab left ingesting is picked up by getMonthState once it is stuck, and only run once", async () => {
    // "never" = the tab that uploaded it died before ingest ran.
    const t = await setup({ runner: "never" });
    const { documentId } = await t.api.uploadFile(csvFile(), { month: "2026-09" });
    expect((await t.api.getMonthState("2026-09")).documents[0]).toMatchObject({ id: documentId, status: "ingesting" });
    expect(t.ingestCalls).toEqual([]);

    // A new tab, after the stuck cutoff (10 minutes) has passed.
    const fresh = await createLaterTab(t.deps, 11 * 60_000);
    await Promise.all([fresh.api.getMonthState("2026-09"), fresh.api.getMonthState("2026-09"), fresh.resumeStuckIngests()]);
    await vi.waitFor(async () => expect((await fresh.api.getMonthState("2026-09")).documents[0]).toMatchObject({ status: "ingested" }));
    expect(t.ingestCalls).toEqual(["synthetic-transactions.csv"]);
  });
});

async function createLaterTab(deps: TestDeps, afterMs: number) {
  deps.setNow(new Date(deps.clock().getTime() + afterMs));
  const ctx = { deps, actor: { userId: (await deps.db.query.user.findFirst())!.id, role: "owner" as const } };
  const blobs = trackBlobs(deps.blobs as never, () => undefined);
  return createLocalApi({ ctx, blobs, ingest: createIngestRunner(deps, ctx), resumeEveryMs: 0 });
}
