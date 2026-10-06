import { beforeEach, describe, expect, it } from "vitest";
import { schema } from "@korra/db";
import {
  ForbiddenError, NotFoundError, ValidationError,
  confirmAllFields, createInvoiceManually, createPaymentManually, decideAllocation, editField, generatePack, getMonthState, getTracker,
} from "./index";
import { createInvoiceManuallyInput } from "./schemas";
import { caCtx, createTestDeps, createTestOwner, type TestDeps } from "./testing";
import { PDF, deelCsv, firaResult, invoiceResult, onboard, upload } from "./helpers.test-util";

let deps: TestDeps;
beforeEach(async () => {
  deps = await createTestDeps();
});

const FIELDS = {
  invoiceNo: "INV-77",
  invoiceDate: "2026-09-05",
  clientName: "Acme Corp",
  clientAddress: "1 Main St, New York",
  clientCountry: "US",
  amount: { minor: "150000", currency: "USD" },
  netRealisableValue: { minor: "150000", currency: "USD" },
  serviceDescription: "Software development services",
  sacCode: "998314",
};

describe("createInvoiceManually", () => {
  it("creates a user-set invoice (confidence 1), defaults the AD bank, and appears in the month", async () => {
    const o = await createTestOwner(deps);
    const bank = await onboard(o.ctx);
    const { id } = await createInvoiceManually(o.ctx, { month: "2026-09", fields: FIELDS });
    const st = await getMonthState(o.ctx, "2026-09");
    const inv = st.invoices.find((i) => i.id === id)!;
    expect(inv.invoiceNo).toEqual({ value: "INV-77", confidence: 1, source: "user" });
    expect(inv.amount.value).toEqual({ minor: "150000", currency: "USD" });
    expect(inv.contractRef.value).toBeNull();
    expect(inv.adBankId.value).toBe(bank.id);
    expect(inv.documentId).toBeNull();
    // Every required field is user-set, so nothing blocks the pack.
    expect(st.blockersByBank[0]!.blockers).toEqual([]);
  });

  it("an explicit AD bank must exist; unknown fields and bad values are rejected", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    await expect(createInvoiceManually(o.ctx, { month: "2026-09", fields: { ...FIELDS, adBankId: "nope" } })).rejects.toBeInstanceOf(ValidationError);
    await expect(createInvoiceManually(o.ctx, { month: "2026-09", fields: { ...FIELDS, bogus: "x" } })).rejects.toThrow(/Unknown invoice field/);
    await expect(createInvoiceManually(o.ctx, { month: "2026-09", fields: { ...FIELDS, amount: 12 } })).rejects.toBeInstanceOf(ValidationError);
    await expect(createInvoiceManually(o.ctx, { month: "2026-13", fields: FIELDS })).rejects.toBeInstanceOf(ValidationError);
  });

  it("the invoice date must fall in `month`; a date is required without a document", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    await expect(createInvoiceManually(o.ctx, { month: "2026-10", fields: FIELDS })).rejects.toThrow(/belongs to 2026-09/);
    const { invoiceDate: _d, ...undated } = FIELDS;
    void _d;
    await expect(createInvoiceManually(o.ctx, { month: "2026-09", fields: undated })).rejects.toThrow(/invoice date is required/);
  });

  it("typed from an uploaded document: links it, and a failed (scanned) upload becomes ingested; undated blocks the pack", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    const docId = await upload(deps, o.ctx, { filename: "scan.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" }); // no fixture -> failed
    expect((await getMonthState(o.ctx, "2026-09")).documents[0]).toMatchObject({ status: "failed" });

    const { invoiceDate: _d, ...undated } = FIELDS;
    void _d;
    const { id } = await createInvoiceManually(o.ctx, { documentId: docId, month: "2026-09", fields: undated });
    const st = await getMonthState(o.ctx, "2026-09");
    expect(st.documents[0]).toMatchObject({ status: "ingested", kind: "invoice" });
    const inv = st.invoices.find((i) => i.id === id)!;
    expect(inv.documentId).toBe(docId);
    expect(inv.invoiceDate.value).toBeNull();
    await expect(createInvoiceManually(o.ctx, { documentId: "not-mine", month: "2026-09", fields: undated })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("re-runs matching: a manual invoice gets a proposal against an existing payment, and a pack can be generated", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    await upload(deps, o.ctx, { filename: "deel.csv", mimeType: "text/csv", bytes: deelCsv(), month: "2026-09" });
    expect((await getMonthState(o.ctx, "2026-09")).allocations).toEqual([]);
    const { id } = await createInvoiceManually(o.ctx, { month: "2026-09", fields: FIELDS });
    const st = await getMonthState(o.ctx, "2026-09");
    expect(st.allocations).toHaveLength(1);
    expect(st.allocations[0]).toMatchObject({ invoiceId: id, status: "proposed" });
    await decideAllocation(o.ctx, { invoiceId: id, paymentId: st.allocations[0]!.paymentId, decision: "confirm" });
    expect((await getMonthState(o.ctx, "2026-09")).realisations[id]!.status).toBe("realised");
    const bankId = st.blockersByBank[0]!.adBankId;
    expect(await generatePack(o.ctx, { month: "2026-09", adBankId: bankId })).toMatchObject({ ok: true });
  });

  it("is owner-only", async () => {
    const o = await createTestOwner(deps);
    const ca = await createTestOwner(deps);
    await expect(createInvoiceManually(caCtx(deps, ca.id, o.id), { month: "2026-09", fields: FIELDS })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("the input schema is exported for forms", () => {
    expect(createInvoiceManuallyInput.safeParse({ month: "2026-09", fields: {} }).success).toBe(true);
    expect(createInvoiceManuallyInput.safeParse({ fields: {} }).success).toBe(false);
  });
});

const PAY = {
  receiptMode: "swift",
  date: "2026-09-21",
  foreignAmount: { minor: "150000", currency: "USD" },
  firaRef: "FIRA-9",
  purposeCode: "P0802",
  payerName: "Acme Corp",
};

describe("createPaymentManually", () => {
  it("creates a user-set payment filed under its date's month, and requires a date", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    const { id } = await createPaymentManually(o.ctx, { fields: PAY });
    const p = (await getMonthState(o.ctx, "2026-09")).payments.find((x) => x.id === id)!;
    expect(p.foreignAmount).toEqual({ value: { minor: "150000", currency: "USD" }, confidence: 1, source: "user" });
    expect(p.fxRate.value).toBeNull();
    expect(p.rail).toBe("generic");
    const { date: _d, ...undated } = PAY;
    void _d;
    await expect(createPaymentManually(o.ctx, { fields: undated })).rejects.toThrow(/date is required/);
    await expect(createPaymentManually(o.ctx, { fields: { ...PAY, bogus: 1 } })).rejects.toBeInstanceOf(ValidationError);
  });

  it("re-runs matching against existing invoices", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    const { id: invoiceId } = await createInvoiceManually(o.ctx, { month: "2026-09", fields: FIELDS });
    const { id: paymentId } = await createPaymentManually(o.ctx, { fields: PAY });
    const a = (await getMonthState(o.ctx, "2026-09")).allocations;
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ invoiceId, paymentId, status: "proposed" });
    expect((await getTracker(o.ctx)).rows.length).toBeGreaterThan(0);
  });

  it("can be attached to the document it was typed from", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    const docId = await upload(deps, o.ctx, { filename: "fira.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const { id } = await createPaymentManually(o.ctx, { documentId: docId, fields: PAY });
    const st = await getMonthState(o.ctx, "2026-09");
    expect(st.payments.find((p) => p.id === id)!.documentId).toBe(docId);
    expect(st.documents[0]!.status).toBe("ingested");
  });
});

describe("confirmAllFields", () => {
  async function extractedInvoice() {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    deps.fixtures["inv.pdf"] = invoiceResult();
    // The local extractor gives 0.6; emulate it here.
    const lowConfidence = invoiceResult();
    for (const k of Object.keys(lowConfidence.invoices[0]!) as (keyof (typeof lowConfidence.invoices)[0])[]) {
      const fld = lowConfidence.invoices[0]![k];
      if (fld.value !== null) (lowConfidence.invoices[0] as Record<string, unknown>)[k] = { ...fld, confidence: 0.6 };
    }
    deps.fixtures["inv.pdf"] = lowConfidence;
    await upload(deps, o.ctx, { filename: "inv.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const inv = (await getMonthState(o.ctx, "2026-09")).invoices[0]!;
    return { o, inv };
  }

  it("marks every non-null field user-set at confidence 1, with one audit row per changed field, and unblocks the pack", async () => {
    const { o, inv } = await extractedInvoice();
    const before = await getMonthState(o.ctx, "2026-09");
    expect(before.blockersByBank[0]!.blockers.some((b) => b.kind === "flagged_field")).toBe(true);

    const res = await confirmAllFields(o.ctx, { entity: "invoice", id: inv.id });
    expect(res.changed.sort()).toEqual(
      ["invoiceNo", "invoiceDate", "clientName", "clientAddress", "clientCountry", "amount", "netRealisableValue", "serviceDescription", "sacCode", "adBankId"].sort(),
    );
    const after = (await getMonthState(o.ctx, "2026-09")).invoices[0]!;
    for (const name of res.changed) expect(after[name as "amount"]).toMatchObject({ confidence: 1, source: "user" });
    expect(after.contractRef.value).toBeNull();
    expect((await getMonthState(o.ctx, "2026-09")).blockersByBank[0]!.blockers).toEqual([]);

    const edits = (await deps.db.select().from(schema.fieldEdit)).filter((e) => e.entityId === inv.id);
    expect(edits).toHaveLength(res.changed.length);
    const amountEdit = edits.find((e) => e.field === "amount")!;
    expect(amountEdit.old).toMatchObject({ confidence: 0.6, source: "extracted" });
    expect(amountEdit.new).toMatchObject({ confidence: 1, source: "user" });
    expect(amountEdit.actorUserId).toBe(o.id);

    // Idempotent: a second call changes (and audits) nothing.
    expect((await confirmAllFields(o.ctx, { entity: "invoice", id: inv.id })).changed).toEqual([]);
    expect((await deps.db.select().from(schema.fieldEdit)).filter((e) => e.entityId === inv.id)).toHaveLength(res.changed.length);
  });

  it("only audits fields that changed: an already user-edited field is skipped", async () => {
    const { o, inv } = await extractedInvoice();
    await editField(o.ctx, { entity: "invoice", id: inv.id, field: "clientName", value: "Acme Inc" });
    const res = await confirmAllFields(o.ctx, { entity: "invoice", id: inv.id });
    expect(res.changed).not.toContain("clientName");
  });

  it("works for payments", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    deps.fixtures["fira.pdf"] = firaResult();
    await upload(deps, o.ctx, { filename: "fira.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const p = (await getMonthState(o.ctx, "2026-09")).payments[0]!;
    const res = await confirmAllFields(o.ctx, { entity: "payment", id: p.id });
    expect(res.changed).toEqual(expect.arrayContaining(["receiptMode", "date", "foreignAmount", "firaRef", "purposeCode", "realisingBankName"]));
    const after = (await getMonthState(o.ctx, "2026-09")).payments[0]!;
    expect(after.firaRef).toMatchObject({ confidence: 1, source: "user" });
    expect(after.fxRate.value).toBeNull();
    expect(await deps.db.select().from(schema.fieldEdit)).toHaveLength(res.changed.length);
  });

  it("is owner-only and scoped to the owner's own records", async () => {
    const { o, inv } = await extractedInvoice();
    const ca = await createTestOwner(deps);
    await expect(confirmAllFields(caCtx(deps, ca.id, o.id), { entity: "invoice", id: inv.id })).rejects.toBeInstanceOf(ForbiddenError);
    const other = await createTestOwner(deps);
    await expect(confirmAllFields(other.ctx, { entity: "invoice", id: inv.id })).rejects.toBeInstanceOf(NotFoundError);
    await expect(confirmAllFields(o.ctx, { entity: "payment", id: "nope" })).rejects.toBeInstanceOf(NotFoundError);
  });
});
