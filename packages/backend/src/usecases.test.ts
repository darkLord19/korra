import { beforeEach, describe, expect, it, vi } from "vitest";
import { IngestError, createIngester, type IssuerFacts } from "@korra/ingest";
import { createClaudeExtractor } from "@korra/ingest/server";
import { createRepos } from "@korra/db";
import {
  ForbiddenError, NotFoundError, ValidationError,
  acceptCaInvite, confirmUpload, createInvoiceManually, decideAllocation, deleteAccount, editField, generatePack, getMonthState,
  getCaInvite, getOnboarding, getPackDownloads, getTracker, inviteCa, isPlaceholderLayout, layoutIdFor, linkNoc, listCaClients, listMyCas,
  markPackSubmitted, requestUpload, revokeCa, runDailyNotifications, requeueStuckIngests, runIngest, saveBank, saveProfile, suggestProfileFromInvoice, sweepStuckIngests, toWire,
} from "./index";
import { caCtx, createTestDeps, createTestOwner, simulateBrowserPut, type TestDeps } from "./testing";
import { PDF, deelCsv, firaResult, invoiceResult, f, onboard, upload, usd } from "./helpers.test-util";

let deps: TestDeps;
beforeEach(async () => {
  deps = await createTestDeps();
});

describe("toWire", () => {
  it("turns bigint and Date into strings recursively", () => {
    expect(toWire({ a: 1n, b: [new Date("2026-01-02T03:04:05Z"), { c: 2n }], d: null })).toEqual({
      a: "1", b: ["2026-01-02T03:04:05.000Z", { c: "2" }], d: null,
    });
  });
});

describe("onboarding", () => {
  it("validates PAN/GSTIN and requires the default bank to exist", async () => {
    const o = await createTestOwner(deps);
    const bad = { legalName: "J", address: "a", pan: "nope", gstin: "x", defaultAdBankId: "b" };
    await expect(saveProfile(o.ctx, bad)).rejects.toBeInstanceOf(ValidationError);
    await expect(saveProfile(o.ctx, { ...bad, pan: "ABCDE1234F", gstin: "29ABCDE1234F1Z5" })).rejects.toBeInstanceOf(NotFoundError);
    expect((await getOnboarding(o.ctx)).complete).toBe(false);
    await onboard(o.ctx);
    const ob = await getOnboarding(o.ctx);
    expect(ob.complete).toBe(true);
    expect(ob.profile?.iec).toBeNull();
  });

  it("saveBank treats the AD code as optional and stores \"\" when it is missing or blank", async () => {
    const o = await createTestOwner(deps);
    expect((await saveBank(o.ctx, { name: "HDFC Bank" })).adCode).toBe("");
    expect((await saveBank(o.ctx, { name: "Axis Bank", adCode: "" })).adCode).toBe("");
    expect((await saveBank(o.ctx, { name: "ICICI Bank", adCode: "   " })).adCode).toBe("");
    expect((await getOnboarding(o.ctx)).banks.map((b) => b.adCode)).toEqual(["", "", ""]);
    await expect(saveBank(o.ctx, { name: "  " })).rejects.toBeInstanceOf(ValidationError);
  });

  it("saveBank normalises a provided AD code (upper-case, no spaces) without enforcing a format", async () => {
    const o = await createTestOwner(deps);
    expect((await saveBank(o.ctx, { name: "A", adCode: " 639 0002 " })).adCode).toBe("6390002");
    expect((await saveBank(o.ctx, { name: "B", adCode: "ab-12x" })).adCode).toBe("AB-12X");
    await expect(saveBank(o.ctx, { name: "C", adCode: "1".repeat(21) })).rejects.toBeInstanceOf(ValidationError);
  });

  it("saveBank can clear an AD code on an existing bank", async () => {
    const o = await createTestOwner(deps);
    const bank = await saveBank(o.ctx, { name: "HDFC Bank", adCode: "6390001" });
    const cleared = await saveBank(o.ctx, { id: bank.id, name: "HDFC Bank", adCode: "" });
    expect(cleared).toEqual({ id: bank.id, name: "HDFC Bank", adCode: "" });
  });
});

describe("suggestProfileFromInvoice", () => {
  const issuer = (over: Partial<Record<keyof IssuerFacts, string | null>> = {}): IssuerFacts => {
    const base = { legalName: "Jane Dev Consulting", address: "12 MG Road, Bengaluru 560001, India", gstin: "29ABCDE1234F1Z5", pan: null, sacCode: "998314", ifsc: "HDFC0001234", bankName: null, ...over };
    return Object.fromEntries(Object.entries(base).map(([k, v]) => [k, f<string>(v, 0.6)])) as unknown as IssuerFacts;
  };
  const file = (filename = "inv.pdf") => ({ bytes: PDF, mimeType: "application/pdf", filename });
  const EMPTY = { legalName: null, address: null, gstin: null, pan: null, sacCode: null, bankKey: null, otherBankName: null, invoiceMonth: null };

  it("maps the issuer to profile values: PAN from the GSTIN, bank from the IFSC, month from the invoice date", async () => {
    const o = await createTestOwner(deps);
    deps.fixtures["inv.pdf"] = { ...invoiceResult(), issuer: issuer() };
    expect(await suggestProfileFromInvoice(o.ctx, file())).toEqual({
      legalName: "Jane Dev Consulting", address: "12 MG Road, Bengaluru 560001, India", gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F",
      sacCode: "998314", bankKey: "hdfc", otherBankName: null, invoiceMonth: "2026-09",
    });
  });

  it("stores nothing: no document, no invoice, no profile", async () => {
    const o = await createTestOwner(deps);
    deps.fixtures["inv.pdf"] = { ...invoiceResult(), issuer: issuer() };
    await suggestProfileFromInvoice(o.ctx, file());
    const r = createRepos(deps.db, o.ctx.actor);
    expect(await r.documents.list()).toEqual([]);
    expect(await r.invoices.list()).toEqual([]);
    expect(await r.profile.get()).toBeNull();
  });

  it("falls back to the bank name (whole-name match, else 'other'), ignores malformed ids and fakes no PAN", async () => {
    const o = await createTestOwner(deps);
    deps.fixtures["a.pdf"] = { ...invoiceResult(), issuer: issuer({ ifsc: null, bankName: "Kotak Mahindra Bank Limited" }) };
    expect(await suggestProfileFromInvoice(o.ctx, file("a.pdf"))).toMatchObject({ bankKey: "kotak", otherBankName: null });
    deps.fixtures["b.pdf"] = { ...invoiceResult(), issuer: issuer({ ifsc: "FDRL0001234", bankName: "Federal Bank" }) };
    expect(await suggestProfileFromInvoice(o.ctx, file("b.pdf"))).toMatchObject({ bankKey: null, otherBankName: "Federal Bank" });
    deps.fixtures["c.pdf"] = { ...invoiceResult(), issuer: issuer({ gstin: "GB123456789", pan: "nope", ifsc: "12345", sacCode: "abc" }) };
    expect(await suggestProfileFromInvoice(o.ctx, file("c.pdf"))).toMatchObject({ gstin: null, pan: null, sacCode: null, bankKey: null });
  });

  it("an unreadable file, or one with no issuer, is an empty suggestion rather than an error", async () => {
    const o = await createTestOwner(deps);
    expect(await suggestProfileFromInvoice(o.ctx, file("no-fixture.pdf"))).toEqual(EMPTY);
    deps.fixtures["plain.pdf"] = invoiceResult();
    expect(await suggestProfileFromInvoice(o.ctx, file("plain.pdf"))).toEqual({ ...EMPTY, invoiceMonth: "2026-09" });
  });

  it("only takes a PDF or an image of up to 20 MB, and only from the owner", async () => {
    const o = await createTestOwner(deps);
    await expect(suggestProfileFromInvoice(o.ctx, { ...file(), mimeType: "text/csv" })).rejects.toBeInstanceOf(ValidationError);
    await expect(suggestProfileFromInvoice(o.ctx, { ...file(), bytes: new Uint8Array(0) })).rejects.toBeInstanceOf(ValidationError);
    await expect(suggestProfileFromInvoice(o.ctx, { ...file(), bytes: new Uint8Array(20 * 1024 * 1024 + 1) })).rejects.toBeInstanceOf(ValidationError);
    const ca = await createTestOwner(deps);
    await expect(suggestProfileFromInvoice(caCtx(deps, ca.id, o.id), file())).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("with the Claude extractor and KORRA_LLM_ENABLED=false it returns an empty suggestion and sends nothing", async () => {
    vi.stubEnv("KORRA_LLM_ENABLED", "false");
    const create = vi.fn();
    const ingester = createIngester({ llm: createClaudeExtractor({ apiKey: "k", client: { messages: { create } } as never }) });
    const o = await createTestOwner({ ...deps, ingester });
    expect(await suggestProfileFromInvoice(o.ctx, file())).toEqual(EMPTY);
    expect(create).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});

describe("uploads", () => {
  it("rejects bad mime type and oversize files", async () => {
    const o = await createTestOwner(deps);
    const base = { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 10, month: "2026-09" } as const;
    await expect(requestUpload(o.ctx, { ...base, mimeType: "application/zip" as never })).rejects.toBeInstanceOf(ValidationError);
    await expect(requestUpload(o.ctx, { ...base, sizeBytes: 21 * 1024 * 1024 })).rejects.toBeInstanceOf(ValidationError);
    await expect(requestUpload(o.ctx, { ...base, month: "2026-13" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("confirmUpload fails until the blob exists, and is idempotent", async () => {
    const o = await createTestOwner(deps);
    const req = await requestUpload(o.ctx, { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: PDF.length, month: "2026-09" });
    await expect(confirmUpload(o.ctx, req.documentId)).rejects.toBeInstanceOf(ValidationError);
    simulateBrowserPut(deps.blobs, { url: req.uploadUrl, token: req.token }, PDF);
    await confirmUpload(o.ctx, req.documentId);
    await confirmUpload(o.ctx, req.documentId);
    const docs = (await getMonthState(o.ctx, "2026-09")).documents;
    expect(docs[0]).toMatchObject({ status: "ingesting", attempts: 1 });
  });

  it("an unreadable file fails with the ingest warning", async () => {
    const o = await createTestOwner(deps);
    const id = await upload(deps, o.ctx, { filename: "mystery.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const doc = (await getMonthState(o.ctx, "2026-09")).documents.find((d) => d.id === id)!;
    expect(doc.status).toBe("failed");
    expect(doc.error).toMatch(/No fixture/);
  });

  it("a user cannot confirm someone else's upload", async () => {
    const a = await createTestOwner(deps);
    const b = await createTestOwner(deps);
    const req = await requestUpload(a.ctx, { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 5, month: "2026-09" });
    await expect(confirmUpload(b.ctx, req.documentId)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("runIngest", () => {
  it("defaults the AD bank, keeps undated invoices visible and blocking", async () => {
    const o = await createTestOwner(deps);
    const bank = await onboard(o.ctx);
    deps.fixtures["undated.pdf"] = invoiceResult({ invoiceDate: f<string>(null, 0) });
    await upload(deps, o.ctx, { filename: "undated.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const st = await getMonthState(o.ctx, "2026-09");
    expect(st.invoices).toHaveLength(1);
    expect(st.invoices[0]!.adBankId).toEqual({ value: bank.id, confidence: 1, source: "default" });
    expect(st.realisations).toEqual({});
    expect(st.blockersByBank).toHaveLength(1);
    expect(st.blockersByBank[0]!.blockers).toContainEqual({ kind: "missing_field", entity: "invoice", id: st.invoices[0]!.id, field: "invoiceDate" });
    expect((await getMonthState(o.ctx, "2026-10")).invoices).toEqual([]);
  });

  it("an invoice with no SAC takes the last used one, as a default below the flag threshold", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    deps.fixtures["a.pdf"] = invoiceResult({ invoiceNo: f("A-1"), sacCode: f("998313", 0.95) });
    deps.fixtures["b.pdf"] = invoiceResult({ invoiceNo: f("B-1"), sacCode: f<string>(null, 0) });
    await upload(deps, o.ctx, { filename: "a.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    expect((await getMonthState(o.ctx, "2026-09")).lastSacCode).toBe("998313");
    await upload(deps, o.ctx, { filename: "b.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const st = await getMonthState(o.ctx, "2026-09");
    const b = st.invoices.find((i) => i.invoiceNo.value === "B-1")!;
    expect(b.sacCode).toEqual({ value: "998313", confidence: 0.7, source: "default" });
    expect(st.invoices.find((i) => i.invoiceNo.value === "A-1")!.sacCode.value).toBe("998313");
    expect(st.blockersByBank[0]!.blockers).toContainEqual({ kind: "flagged_field", entity: "invoice", id: b.id, field: "sacCode", confidence: 0.7 });
  });

  it("leaves the SAC empty when there is no earlier invoice with one, and never lets a default breed another default", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    deps.fixtures["none.pdf"] = invoiceResult({ invoiceNo: f("N-1"), sacCode: f<string>(null, 0) });
    await upload(deps, o.ctx, { filename: "none.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    let st = await getMonthState(o.ctx, "2026-09");
    expect(st.lastSacCode).toBeNull();
    expect(st.invoices[0]!.sacCode.value).toBeNull();
    expect(st.blockersByBank[0]!.blockers).toContainEqual({ kind: "missing_field", entity: "invoice", id: st.invoices[0]!.id, field: "sacCode" });

    // The user types one invoice with a SAC; the next one without takes it, and the default is not itself "last used" later.
    await createInvoiceManually(o.ctx, { month: "2026-09", fields: { invoiceNo: "M-1", invoiceDate: "2026-09-03", sacCode: "998391" } });
    deps.fixtures["c.pdf"] = invoiceResult({ invoiceNo: f("C-1"), sacCode: f<string>(null, 0) });
    await upload(deps, o.ctx, { filename: "c.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    st = await getMonthState(o.ctx, "2026-09");
    expect(st.lastSacCode).toBe("998391");
    expect(st.invoices.find((i) => i.invoiceNo.value === "C-1")!.sacCode).toEqual({ value: "998391", confidence: 0.7, source: "default" });
    await editField(o.ctx, { entity: "invoice", id: st.invoices.find((i) => i.invoiceNo.value === "M-1")!.id, field: "sacCode", value: "998311" });
    expect((await getMonthState(o.ctx, "2026-09")).lastSacCode).toBe("998311");
  });

  it("is idempotent when re-run, and refuses once the user edited the rows", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    deps.fixtures["inv.pdf"] = invoiceResult();
    const id = await upload(deps, o.ctx, { filename: "inv.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const r = createRepos(deps.db, o.ctx.actor);
    await r.documents.setStatus(id, "ingesting");
    await runIngest(deps, id);
    expect(await r.invoices.list()).toHaveLength(1);

    const [inv] = await r.invoices.list();
    await editField(o.ctx, { entity: "invoice", id: inv!.id, field: "clientName", value: "Acme Corporation" });
    await r.documents.setStatus(id, "ingesting");
    await runIngest(deps, id);
    expect((await r.documents.get(id)).status).toBe("failed");
    expect((await r.documents.get(id)).error).toMatch(/edited or matched/);
    expect((await r.invoices.list())[0]!.clientName.value).toBe("Acme Corporation");
  });

  it("requeueStuckIngests re-queues only this owner's stuck documents, once per attempt", async () => {
    const o = await createTestOwner(deps);
    const other = await createTestOwner(deps);
    deps.ingester = { async ingest() { throw new IngestError("overloaded", { retryable: true, code: "overloaded" }); } };
    const id = await upload(deps, o.ctx, { filename: "x.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const otherId = await upload(deps, other.ctx, { filename: "y.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const r = createRepos(deps.db, o.ctx.actor);
    expect(await requeueStuckIngests(o.ctx)).toEqual([]); // not stuck yet
    for (const attempts of [2, 3]) {
      deps.setNow(new Date(deps.clock().getTime() + 11 * 60_000));
      expect(await requeueStuckIngests(o.ctx)).toEqual([id]);
      expect(await requeueStuckIngests(o.ctx)).toEqual([]); // timer restarted: no double queue
      expect((await r.documents.get(id)).attempts).toBe(attempts);
    }
    deps.setNow(new Date(deps.clock().getTime() + 11 * 60_000));
    expect(await requeueStuckIngests(o.ctx)).toEqual([]);
    expect((await r.documents.get(id)).status).toBe("failed");
    expect((await createRepos(deps.db, other.ctx.actor).documents.get(otherId)).attempts).toBe(1);
    await expect(requeueStuckIngests({ ...o.ctx, actor: { userId: "ca", role: "ca", ownerUserId: o.ctx.actor.userId } })).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("retryable errors stay ingesting for the sweep; non-retryable fail", async () => {
    const o = await createTestOwner(deps);
    let mode: "retry" | "fatal" = "retry";
    const real = deps.ingester;
    deps.ingester = {
      async ingest(doc) {
        if (mode === "retry") throw new IngestError("overloaded", { retryable: true, code: "overloaded" });
        if (mode === "fatal") throw new IngestError("bad pdf", { retryable: false, code: "bad" });
        return real.ingest(doc);
      },
    };
    const id = await upload(deps, o.ctx, { filename: "x.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const r = createRepos(deps.db, o.ctx.actor);
    expect((await r.documents.get(id)).status).toBe("ingesting");

    // sweep: not yet stuck
    expect(await sweepStuckIngests(deps)).toEqual({ requeued: 0, failed: 0 });
    // 11 minutes later it is re-run (attempt 2), still failing
    deps.setNow(new Date(deps.clock().getTime() + 11 * 60_000));
    expect(await sweepStuckIngests(deps)).toEqual({ requeued: 1, failed: 0 });
    expect((await r.documents.get(id)).attempts).toBe(2);
    deps.setNow(new Date(deps.clock().getTime() + 11 * 60_000));
    expect(await sweepStuckIngests(deps)).toEqual({ requeued: 1, failed: 0 });
    expect((await r.documents.get(id)).attempts).toBe(3);
    deps.setNow(new Date(deps.clock().getTime() + 11 * 60_000));
    expect(await sweepStuckIngests(deps)).toEqual({ requeued: 0, failed: 1 });
    expect((await r.documents.get(id)).status).toBe("failed");

    const id2 = await upload(deps, o.ctx, { filename: "y.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" }, { ingest: false });
    mode = "fatal";
    await runIngest(deps, id2);
    expect(await r.documents.get(id2)).toMatchObject({ status: "failed", error: "bad pdf" });
  });

  it("merges a FIRA into the matching Deel payment (keeping its rail) and links a NOC by amount", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    await upload(deps, o.ctx, { filename: "deel.csv", mimeType: "text/csv", bytes: deelCsv(), month: "2026-09" });
    deps.fixtures["fira.pdf"] = firaResult();
    deps.fixtures["noc.pdf"] = { kind: "noc", rail: null, invoices: [], payments: [], warnings: [], nocRef: { reference: "NOC-1", amount: usd(2000), date: "2026-09-20" } };
    const firaDoc = await upload(deps, o.ctx, { filename: "fira.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const nocDoc = await upload(deps, o.ctx, { filename: "noc.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });

    const st = await getMonthState(o.ctx, "2026-09");
    expect(st.payments).toHaveLength(3); // merged, not inserted
    const swift = st.payments.find((p) => p.firaRef.value === "FIRA-777")!;
    expect(swift.rail).toBe("deel");
    expect(swift.purposeCode.value).toBe("P0802");
    expect(swift.nocDocumentId).toBe(nocDoc);
    expect(st.documents.find((d) => d.id === firaDoc)).toMatchObject({ kind: "fira", status: "ingested" });
  });

  it("a FIRA with no matching payment becomes a new payment; an unmatched NOC can be linked by hand", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    deps.fixtures["fira.pdf"] = firaResult();
    deps.fixtures["noc.pdf"] = { kind: "noc", rail: null, invoices: [], payments: [], warnings: [], nocRef: { reference: null, amount: null, date: null } };
    await upload(deps, o.ctx, { filename: "fira.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const nocDoc = await upload(deps, o.ctx, { filename: "noc.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    let st = await getMonthState(o.ctx, "2026-09");
    expect(st.payments).toHaveLength(1);
    expect(st.payments[0]!.rail).toBe("generic");
    expect(st.payments[0]!.nocDocumentId).toBeNull();
    await linkNoc(o.ctx, { paymentId: st.payments[0]!.id, documentId: nocDoc });
    st = await getMonthState(o.ctx, "2026-09");
    expect(st.payments[0]!.nocDocumentId).toBe(nocDoc);
  });
});

describe("matching, review and allocation rules", () => {
  async function setup() {
    const o = await createTestOwner(deps);
    const bank = await onboard(o.ctx);
    await upload(deps, o.ctx, { filename: "deel.csv", mimeType: "text/csv", bytes: deelCsv(), month: "2026-09" });
    deps.fixtures["inv.pdf"] = invoiceResult();
    await upload(deps, o.ctx, { filename: "inv.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    return { o, bank };
  }

  it("proposes an allocation, confirm sets realisation, over-allocation is refused, reject is remembered", async () => {
    const { o } = await setup();
    let st = await getMonthState(o.ctx, "2026-09");
    expect(st.allocations).toHaveLength(1);
    expect(st.allocations[0]).toMatchObject({ status: "proposed", amount: { minor: "150000", currency: "USD" } });
    const a = st.allocations[0]!;

    await decideAllocation(o.ctx, { invoiceId: a.invoiceId, paymentId: a.paymentId, decision: "confirm" });
    st = await getMonthState(o.ctx, "2026-09");
    expect(st.realisations[a.invoiceId]!.status).toBe("realised");

    await decideAllocation(o.ctx, { invoiceId: a.invoiceId, paymentId: a.paymentId, decision: "reject" });
    st = await getMonthState(o.ctx, "2026-09");
    expect(st.allocations.find((x) => x.paymentId === a.paymentId)!.status).toBe("rejected");
    expect(st.realisations[a.invoiceId]!.status).toBe("open");
    await expect(decideAllocation(o.ctx, { invoiceId: a.invoiceId, paymentId: "nope", decision: "confirm" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("refuses to confirm beyond amount x 1.03", async () => {
    const { o } = await setup();
    const st = await getMonthState(o.ctx, "2026-09");
    const a = st.allocations[0]!;
    // Shrink the invoice to 1000: the 1500 proposal is now too large.
    const r = createRepos(deps.db, o.ctx.actor);
    await r.invoices.updateField(a.invoiceId, "amount", { minor: 100000n, currency: "USD" });
    await expect(decideAllocation(o.ctx, { invoiceId: a.invoiceId, paymentId: a.paymentId, decision: "confirm" })).rejects.toBeInstanceOf(ValidationError);
  });

  it("editField validates names and values, re-matches after amount edits, and audits", async () => {
    const { o } = await setup();
    const st = await getMonthState(o.ctx, "2026-09");
    const inv = st.invoices[0]!;
    await expect(editField(o.ctx, { entity: "invoice", id: inv.id, field: "bogus", value: "x" })).rejects.toBeInstanceOf(ValidationError);
    await expect(editField(o.ctx, { entity: "invoice", id: inv.id, field: "amount", value: 12 })).rejects.toBeInstanceOf(ValidationError);
    await expect(editField(o.ctx, { entity: "invoice", id: inv.id, field: "amount", value: { minor: "1.5", currency: "USD" } })).rejects.toBeInstanceOf(ValidationError);
    await expect(editField(o.ctx, { entity: "invoice", id: inv.id, field: "invoiceDate", value: "2026-02-31" })).rejects.toBeInstanceOf(ValidationError);
    await expect(editField(o.ctx, { entity: "invoice", id: inv.id, field: "adBankId", value: "not-my-bank" })).rejects.toBeInstanceOf(ValidationError);

    await editField(o.ctx, { entity: "invoice", id: inv.id, field: "amount", value: { minor: "999999", currency: "USD" } });
    expect((await getMonthState(o.ctx, "2026-09")).allocations).toEqual([]); // proposal no longer fits
    await editField(o.ctx, { entity: "invoice", id: inv.id, field: "amount", value: { minor: "150000", currency: "USD" } });
    expect((await getMonthState(o.ctx, "2026-09")).allocations).toHaveLength(1);

    const after = (await getMonthState(o.ctx, "2026-09")).invoices[0]!;
    expect(after.amount).toMatchObject({ confidence: 1, source: "user" });
  });

  it("editing the invoice date moves it to another month's state", async () => {
    const { o } = await setup();
    const inv = (await getMonthState(o.ctx, "2026-09")).invoices[0]!;
    await editField(o.ctx, { entity: "invoice", id: inv.id, field: "invoiceDate", value: "2026-10-03" });
    expect((await getMonthState(o.ctx, "2026-09")).invoices).toEqual([]);
    expect((await getMonthState(o.ctx, "2026-10")).invoices).toHaveLength(1);
  });
});

describe("packs", () => {
  it("picks layouts by bank name", () => {
    expect(layoutIdFor("ICICI Bank Ltd")).toBe("icici");
    expect(layoutIdFor("HDFC BANK")).toBe("hdfc");
    expect(layoutIdFor("Axis Bank")).toBe("axis");
    expect(layoutIdFor("State Bank of India")).toBe("generic");
  });

  it("only banks without a verified layout are flagged as placeholders; multiple banks get separate blockers", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx, "HDFC Bank");
    deps.fixtures["inv.pdf"] = invoiceResult();
    await upload(deps, o.ctx, { filename: "inv.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const res = await generatePack(o.ctx, { month: "2026-09", adBankId: (await getOnboarding(o.ctx)).banks[0]!.id });
    expect(res).toMatchObject({ ok: true, layoutId: "hdfc", placeholder: false });
    expect(isPlaceholderLayout("hdfc")).toBe(false);
    expect(isPlaceholderLayout("icici")).toBe(true);
    expect(isPlaceholderLayout("axis")).toBe(true);
    expect(isPlaceholderLayout("generic")).toBe(false);
    const bad = await generatePack(o.ctx, { month: "2026-08", adBankId: (await getOnboarding(o.ctx)).banks[0]!.id });
    expect(bad).toEqual({ ok: false, blockers: [{ kind: "no_invoices" }] });
    await expect(generatePack(o.ctx, { month: "2026-09", adBankId: "nope" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("pending invoice documents block the pack", async () => {
    const o = await createTestOwner(deps);
    const bank = await onboard(o.ctx);
    deps.fixtures["inv.pdf"] = invoiceResult();
    await upload(deps, o.ctx, { filename: "inv.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const pendingId = await upload(deps, o.ctx, { filename: "later.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09", hint: "invoice" }, { ingest: false });
    const res = await generatePack(o.ctx, { month: "2026-09", adBankId: bank.id });
    expect(res).toEqual({ ok: false, blockers: [{ kind: "document_pending", documentId: pendingId }] });
    expect((await getMonthState(o.ctx, "2026-09")).pendingDocumentIds).toEqual([pendingId]);
  });

  it("acknowledgement uploads are stored, never ingested, and never pending", async () => {
    const o = await createTestOwner(deps);
    const bank = await onboard(o.ctx);
    deps.fixtures["inv.pdf"] = invoiceResult();
    await upload(deps, o.ctx, { filename: "inv.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    deps.fixtures["ack.pdf"] = invoiceResult({ invoiceNo: f("JUNK-1") }); // would create a junk invoice if ingested
    const req = await requestUpload(o.ctx, { filename: "ack.pdf", mimeType: "application/pdf", sizeBytes: PDF.length, month: "2026-09", hint: "ack" });
    simulateBrowserPut(deps.blobs, { url: req.uploadUrl, token: req.token }, PDF);
    expect(await confirmUpload(o.ctx, req.documentId)).toEqual({ documentId: req.documentId, ingest: false });
    await runIngest(deps, req.documentId); // a no-op for ack documents
    const state = await getMonthState(o.ctx, "2026-09");
    expect(state.documents.find((d) => d.id === req.documentId)).toMatchObject({ kind: "ack", status: "ingested", attempts: 0 });
    expect(state.invoices).toHaveLength(1);
    expect(state.pendingDocumentIds).toEqual([]);

    const res = await generatePack(o.ctx, { month: "2026-09", adBankId: bank.id });
    if (!res.ok) throw new Error("expected ok");
    const pack = await markPackSubmitted(o.ctx, { packId: res.packId, ackDocumentId: req.documentId });
    expect(pack.status).toBe("submitted");
  });

  it("markPackSubmitted only accepts the user's own acknowledgement document", async () => {
    const o = await createTestOwner(deps);
    const other = await createTestOwner(deps, "other@example.test");
    const bank = await onboard(o.ctx);
    deps.fixtures["inv.pdf"] = invoiceResult();
    const invDoc = await upload(deps, o.ctx, { filename: "inv.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const otherAck = await upload(deps, other.ctx, { filename: "ack.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09", hint: "ack" });
    const res = await generatePack(o.ctx, { month: "2026-09", adBankId: bank.id });
    if (!res.ok) throw new Error("expected ok");
    await expect(markPackSubmitted(o.ctx, { packId: res.packId, ackDocumentId: invDoc })).rejects.toBeInstanceOf(ValidationError);
    await expect(markPackSubmitted(o.ctx, { packId: res.packId, ackDocumentId: otherAck })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("markPackSubmitted stops the EDF reminder", async () => {
    const o = await createTestOwner(deps);
    const bank = await onboard(o.ctx);
    deps.fixtures["inv.pdf"] = invoiceResult();
    await upload(deps, o.ctx, { filename: "inv.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const res = await generatePack(o.ctx, { month: "2026-09", adBankId: bank.id });
    if (!res.ok) throw new Error("expected ok");
    // EDF due 2026-10-30: 3 days before is 2026-10-27
    deps.setNow("2026-10-27T05:00:00Z");
    await markPackSubmitted(o.ctx, { packId: res.packId });
    const run = await runDailyNotifications(deps);
    expect(deps.mailer.sent.filter((m) => /EDF/.test(m.subject))).toEqual([]);
    expect(run.failed).toBe(0);
  });
});

describe("tracker", () => {
  it("totals outstanding, due within 60 days and overdue per currency", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    const r = createRepos(deps.db, o.ctx.actor);
    const mk = (no: string, date: string, amount: number) => ({
      ...invoiceResult({ invoiceNo: f(no), invoiceDate: f(date), amount: f(usd(amount)) }).invoices[0]!,
      adBankId: f("x", 1, "default" as const),
    });
    // asOf 2026-11-02. deadlines: 2026-12-15 (due in 43d), 2026-03-01 (overdue), 2027-08-01 (far)
    await r.invoices.insertExtracted(null, [mk("A", "2026-03-15", 100), mk("B", "2025-06-01", 50), mk("C", "2026-11-01", 25)]);
    const t = await getTracker(o.ctx);
    expect(t.rows).toHaveLength(3);
    expect(t.totals.outstanding).toEqual([{ currency: "USD", minor: "17500" }]);
    expect(t.totals.due60).toEqual([{ currency: "USD", minor: "10000" }]);
    expect(t.totals.overdue).toEqual([{ currency: "USD", minor: "5000" }]);
  });
});

describe("daily notifications", () => {
  it("sends once per dedupe key, with the disclaimer", async () => {
    const o = await createTestOwner(deps, "jane@example.test");
    await onboard(o.ctx);
    deps.fixtures["inv.pdf"] = invoiceResult();
    await upload(deps, o.ctx, { filename: "inv.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    deps.setNow("2026-10-20T04:00:00Z"); // 10 days before 2026-10-30
    expect(await runDailyNotifications(deps)).toEqual({ sent: 1, skipped: 0, failed: 0 });
    expect(deps.mailer.sent[0]).toMatchObject({ to: "jane@example.test" });
    expect(deps.mailer.sent[0]!.subject).toMatch(/2026-09.*2026-10-30/);
    expect(deps.mailer.sent[0]!.text).toMatch(/not legal, tax or financial advice/);
    expect(deps.mailer.sent[0]!.text).toContain("http://localhost:3000/months/2026-09");
    deps.setNow("2026-10-21T04:00:00Z"); // catch-up window: same key
    expect(await runDailyNotifications(deps)).toEqual({ sent: 0, skipped: 1, failed: 0 });
    expect(deps.mailer.sent).toHaveLength(1);
  });

  it("counts failed sends without throwing", async () => {
    const o = await createTestOwner(deps);
    await onboard(o.ctx);
    deps.fixtures["inv.pdf"] = invoiceResult();
    await upload(deps, o.ctx, { filename: "inv.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    deps.mailer.send = async () => {
      throw new Error("smtp down");
    };
    deps.setNow("2026-10-20T04:00:00Z");
    expect(await runDailyNotifications(deps)).toEqual({ sent: 0, skipped: 0, failed: 1 });
  });
});

describe("CA sharing", () => {
  it("invite emails a link; accept; list; read-only access; revoke", async () => {
    const owner = await createTestOwner(deps);
    const ca = await createTestOwner(deps, "ca@firm.test");
    const stranger = await createTestOwner(deps);
    const bank = await onboard(owner.ctx);
    deps.fixtures["inv.pdf"] = invoiceResult();
    await upload(deps, owner.ctx, { filename: "inv.pdf", mimeType: "application/pdf", bytes: PDF, month: "2026-09" });
    const pack = await generatePack(owner.ctx, { month: "2026-09", adBankId: bank.id });
    if (!pack.ok) throw new Error("expected ok");

    await expect(inviteCa(owner.ctx, "not-an-email")).rejects.toBeInstanceOf(ValidationError);
    const share = await inviteCa(owner.ctx, "CA@Firm.test");
    expect(share.status).toBe("invited");
    const mail = deps.mailer.sent.at(-1)!;
    expect(mail.to).toBe("ca@firm.test");
    const token = /ca\/accept\?token=([^\s]+)/.exec(mail.text)![1]!;
    expect(mail.text).toContain("http://localhost:3000/ca/accept?token=");

    const cx = caCtx(deps, ca.id, owner.id);
    await expect(getMonthState(cx, "2026-09")).rejects.toBeInstanceOf(NotFoundError); // not accepted yet
    expect(await getCaInvite(ca.ctx, token)).toMatchObject({ ownerUserId: owner.id, caEmail: "ca@firm.test", status: "invited", emailMatches: true, isOwner: false });
    expect(await getCaInvite(stranger.ctx, token)).toMatchObject({ emailMatches: false });
    expect(await getCaInvite(owner.ctx, token)).toMatchObject({ isOwner: true });
    await expect(getCaInvite(ca.ctx, "no-such-token")).rejects.toBeInstanceOf(NotFoundError);
    await expect(acceptCaInvite(stranger.ctx, token)).rejects.toBeInstanceOf(NotFoundError);
    expect(await acceptCaInvite(ca.ctx, token)).toMatchObject({ ownerUserId: owner.id });
    expect(await listCaClients(ca.ctx)).toHaveLength(1);
    expect((await listMyCas(owner.ctx))[0]).toMatchObject({ caEmail: "ca@firm.test", status: "accepted" });
    expect(JSON.stringify(await listMyCas(owner.ctx))).not.toContain(token);

    // read-only reads work
    expect((await getMonthState(cx, "2026-09")).invoices).toHaveLength(1);
    expect((await getTracker(cx)).rows).toHaveLength(1);
    expect((await getPackDownloads(cx, pack.packId)).files).toHaveLength(4);
    // writes do not
    const inv = (await getMonthState(cx, "2026-09")).invoices[0]!;
    await expect(editField(cx, { entity: "invoice", id: inv.id, field: "clientName", value: "x" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(generatePack(cx, { month: "2026-09", adBankId: bank.id })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(requestUpload(cx, { filename: "a.pdf", mimeType: "application/pdf", sizeBytes: 1, month: "2026-09" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(deleteAccount(cx)).rejects.toBeInstanceOf(ForbiddenError);
    await expect(markPackSubmitted(cx, { packId: pack.packId })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(inviteCa(cx, "x@y.test")).rejects.toBeInstanceOf(ForbiddenError);

    await revokeCa(owner.ctx, share.id);
    await expect(getPackDownloads(cx, pack.packId)).rejects.toBeInstanceOf(NotFoundError);
  });
});
