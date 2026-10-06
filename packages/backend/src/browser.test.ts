import { describe, expect, it } from "vitest";
import { createLocalPdfExtractor } from "@korra/ingest/pdf";
import { createMemoryBlobStore, createTestDb, simulateBrowserPut } from "@korra/db/testing";
import { LOCAL_OWNER_ID, createLocalDeps, ensureLocalOwner } from "./browser";
import { confirmUpload, getMonthState, requestUpload, runIngest, saveBank, saveProfile } from "./index";

const PDF = new TextEncoder().encode("%PDF-1.4 fake");
const TEXT = [
  "Jane Dev Consulting",
  "Invoice No: INV-1",
  "Invoice Date: 02 Sep 2026",
  "Bill To:",
  "Acme Corp",
  "New York, United States",
  "Total Due USD 1,500.00",
];

describe("browser deps", () => {
  it("ensureLocalOwner is idempotent and returns a stable owner ctx", async () => {
    const deps = createLocalDeps({ db: await createTestDb(), blobs: createMemoryBlobStore() });
    const a = await ensureLocalOwner(deps);
    const b = await ensureLocalOwner(deps);
    expect(a.actor).toEqual({ userId: LOCAL_OWNER_ID, role: "owner" });
    expect(b.actor).toEqual(a.actor);
    expect((await a.deps.db.query.user.findMany()).length).toBe(1);
    await expect(deps.mailer.send({ to: "x@y.z", subject: "s", text: "t" })).resolves.toBeUndefined();
  });

  it("runs upload -> ingest with the local PDF extractor; extracted fields are flagged (confidence 0.6)", async () => {
    const blobs = createMemoryBlobStore();
    // createLocalDeps builds the extractor from getTextLayer; the real thing would use pdf.js + workerSrc.
    const deps = createLocalDeps({ db: await createTestDb(), blobs, getTextLayer: async () => TEXT });
    const ctx = await ensureLocalOwner(deps);
    const bank = await saveBank(ctx, { name: "HDFC", adCode: "123" });
    await saveProfile(ctx, { legalName: "Jane", address: "x", pan: "ABCDE1234F", gstin: "29ABCDE1234F1Z5", defaultAdBankId: bank.id });

    const req = await requestUpload(ctx, { filename: "inv.pdf", mimeType: "application/pdf", sizeBytes: PDF.length, month: "2026-09" });
    simulateBrowserPut(blobs, { url: req.uploadUrl, token: req.token }, PDF);
    await confirmUpload(ctx, req.documentId);
    await runIngest(deps, req.documentId);

    const month = await getMonthState(ctx, "2026-09");
    expect(month.documents[0]).toMatchObject({ status: "ingested", kind: "invoice" });
    const inv = month.invoices[0]!;
    expect(inv.invoiceNo).toEqual({ value: "INV-1", confidence: 0.6, source: "extracted" });
    expect(inv.amount.value).toEqual({ minor: "150000", currency: "USD" });
    expect(inv.adBankId.value).toBe(bank.id);
    expect(month.blockersByBank[0]!.blockers.some((b) => b.kind === "flagged_field")).toBe(true);
  });

  it("an image upload fails with the by-hand message", async () => {
    const blobs = createMemoryBlobStore();
    const deps = createLocalDeps({ db: await createTestDb(), blobs, getTextLayer: async () => TEXT });
    const ctx = await ensureLocalOwner(deps);
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0]);
    const req = await requestUpload(ctx, { filename: "scan.png", mimeType: "image/png", sizeBytes: png.length, month: "2026-09" });
    simulateBrowserPut(blobs, { url: req.uploadUrl, token: req.token }, png);
    await confirmUpload(ctx, req.documentId);
    await runIngest(deps, req.documentId);
    expect((await getMonthState(ctx, "2026-09")).documents[0]).toMatchObject({
      status: "failed",
      error: "Scanned or image file: enter the details by hand",
    });
    void createLocalPdfExtractor;
  });
});
