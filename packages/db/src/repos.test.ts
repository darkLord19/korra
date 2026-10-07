import { eq } from "drizzle-orm";
import type { Field, InvoiceFacts, Money, PaymentFacts } from "@korra/core";
import { beforeEach, describe, expect, it } from "vitest";
import {
  type Actor,
  type Db,
  ForbiddenError,
  ValidationError,
  NotFoundError,
  countCasWithAtLeast,
  createRepos,
  findStuckIngests,
  getDocumentForSystem,
  listNotificationState,
  recordNotification,
  failExhaustedIngests,
  schema,
} from "./index";
import { createTestDb, createTestUser } from "./testing";

const f = <T>(value: T | null, confidence = 0.8, source: Field<T>["source"] = "extracted"): Field<T> => ({
  value,
  confidence,
  source,
});

function invoiceFacts(over: Partial<Omit<InvoiceFacts, "id">> = {}): Omit<InvoiceFacts, "id"> {
  return {
    invoiceNo: f("INV-1"),
    invoiceDate: f("2026-10-15"),
    clientName: f("Acme Inc"),
    clientAddress: f("1 Main St"),
    clientCountry: f("US"),
    amount: f({ minor: 123_456_789_012_345_678n, currency: "USD" }),
    netRealisableValue: f({ minor: 100_000n, currency: "USD" }),
    inrEquivalent: f<Money>(null, 0, "default"),
    contractRef: f<string>(null, 0),
    serviceDescription: f("Software services"),
    sacCode: f("998314"),
    adBankId: f("bank-1", 1, "default"),
    ...over,
  };
}

function paymentFacts(over: Partial<Omit<PaymentFacts, "id">> = {}): Omit<PaymentFacts, "id"> {
  return {
    rail: "deel",
    receiptMode: f("local_transfer" as const, 1),
    date: f("2026-11-02", 1),
    foreignAmount: f({ minor: 100_000n, currency: "USD" }, 1),
    inrCredited: f({ minor: 8_300_000n, currency: "INR" }, 1),
    fxRate: f("83.0", 1),
    fees: f<{ minor: bigint; currency: string }>(null, 0),
    firaRef: f<string>(null, 0),
    purposeCode: f<string>(null, 0),
    payerName: f("Acme Inc", 1),
    realisingBankName: f<string>(null, 0),
    ...over,
  };
}

const owner = (userId: string): Actor => ({ userId, role: "owner" });
const ca = (userId: string, ownerUserId: string): Actor => ({ userId, role: "ca", ownerUserId });

let db: Db;
let a: { id: string; email: string };
let b: { id: string; email: string };
let cuser: { id: string; email: string };

beforeEach(async () => {
  db = await createTestDb();
  a = await createTestUser(db, { email: "a@example.test" });
  b = await createTestUser(db, { email: "b@example.test" });
  cuser = await createTestUser(db, { email: "ca@firm.test" });
});

async function shareWithCa(ownerId = a.id) {
  const owned = createRepos(db, owner(ownerId));
  const { token } = await owned.shares.invite("CA@firm.test");
  return createRepos(db, owner(cuser.id)).shares.accept(token);
}

describe("ownership isolation", () => {
  it("hides and protects another user's invoices", async () => {
    const ra = createRepos(db, owner(a.id));
    const rb = createRepos(db, owner(b.id));
    const [id] = await ra.invoices.insertExtracted(null, [invoiceFacts()]);

    expect(await rb.invoices.listByMonth("2026-10")).toEqual([]);
    await expect(rb.invoices.get(id!)).rejects.toBeInstanceOf(NotFoundError);
    await expect(rb.invoices.updateField(id!, "clientName", "Evil")).rejects.toBeInstanceOf(NotFoundError);
    await expect(rb.invoices.get("does-not-exist")).rejects.toBeInstanceOf(NotFoundError);
    expect((await ra.invoices.get(id!)).clientName.value).toBe("Acme Inc");
  });

  it("does not let a user attach their extraction to someone else's document", async () => {
    const ra = createRepos(db, owner(a.id));
    const rb = createRepos(db, owner(b.id));
    const doc = await ra.documents.create({ filename: "x.pdf", mimeType: "application/pdf" });
    await expect(rb.invoices.insertExtracted(doc.id, [invoiceFacts()])).rejects.toBeInstanceOf(NotFoundError);
    await expect(rb.documents.get(doc.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("money round-trip", () => {
  it("preserves bigint minor units beyond 2^53", async () => {
    const ra = createRepos(db, owner(a.id));
    const [iid] = await ra.invoices.insertExtracted(null, [invoiceFacts()]);
    const inv = await ra.invoices.get(iid!);
    expect(inv.amount.value).toEqual({ minor: 123_456_789_012_345_678n, currency: "USD" });
    expect(typeof inv.amount.value!.minor).toBe("bigint");

    const [pid] = await ra.payments.insertExtracted(null, [paymentFacts()]);
    await ra.allocations.replaceProposed([
      { invoiceId: iid!, paymentId: pid!, amount: { minor: 9_007_199_254_740_993n, currency: "USD" }, score: 0.9, status: "proposed" },
    ]);
    const [al] = await ra.allocations.list();
    expect(al!.amount).toEqual({ minor: 9_007_199_254_740_993n, currency: "USD" });
    expect((await ra.payments.get(pid!)).foreignAmount.value).toEqual({ minor: 100_000n, currency: "USD" });
  });
});

describe("updateField", () => {
  it("sets a user field, audits it in the same step, and syncs denormalised columns", async () => {
    const ra = createRepos(db, owner(a.id));
    const [id] = await ra.invoices.insertExtracted(null, [invoiceFacts()]);

    const updated = await ra.invoices.updateField(id!, "invoiceDate", "2026-12-03");
    expect(updated.invoiceDate).toEqual({ value: "2026-12-03", confidence: 1, source: "user" });
    await ra.invoices.updateField(id!, "adBankId", "bank-2");

    const row = (await db.select().from(schema.invoice).where(eq(schema.invoice.id, id!)))[0]!;
    expect(row.month).toBe("2026-12");
    expect(row.adBankId).toBe("bank-2");
    expect(await ra.invoices.listByMonth("2026-10")).toEqual([]);
    expect((await ra.invoices.listByMonth("2026-12", { adBankId: "bank-2" })).map((i) => i.id)).toEqual([id]);

    const edits = await db.select().from(schema.fieldEdit).where(eq(schema.fieldEdit.entityId, id!));
    expect(edits).toHaveLength(2);
    const dateEdit = edits.find((e) => e.field === "invoiceDate")!;
    expect(dateEdit).toMatchObject({ userId: a.id, actorUserId: a.id, entity: "invoice" });
    expect(dateEdit.old).toMatchObject({ value: "2026-10-15", source: "extracted" });
    expect(dateEdit.new).toEqual({ value: "2026-12-03", confidence: 1, source: "user" });
  });

  it("stores Money edits as strings in JSON and returns bigint", async () => {
    const ra = createRepos(db, owner(a.id));
    const [id] = await ra.invoices.insertExtracted(null, [invoiceFacts()]);
    const out = await ra.invoices.updateField(id!, "amount", { minor: 5_000n, currency: "EUR" });
    expect(out.amount.value).toEqual({ minor: 5_000n, currency: "EUR" });
    const [edit] = await db.select().from(schema.fieldEdit);
    expect(edit!.new).toMatchObject({ value: { minor: "5000", currency: "EUR" } });
  });

  it("works for payments and keeps month in sync", async () => {
    const ra = createRepos(db, owner(a.id));
    const [id] = await ra.payments.insertExtracted(null, [paymentFacts()]);
    await ra.payments.updateField(id!, "date", "2027-01-05");
    expect((await ra.payments.listByMonth("2027-01")).map((p) => p.id)).toEqual([id]);
    const edits = await db.select().from(schema.fieldEdit);
    expect(edits.map((e) => [e.entity, e.field])).toEqual([["payment", "date"]]);
  });
});

describe("payments: NOC and FIRA merge", () => {
  it("links a NOC document and merges FIRA fields without clobbering user values", async () => {
    const ra = createRepos(db, owner(a.id));
    const [pid] = await ra.payments.insertExtracted(null, [paymentFacts({ receiptMode: f("swift" as const, 1) })]);
    await ra.payments.updateField(pid!, "purposeCode", "P0802");
    const noc = await ra.documents.create({ filename: "noc.pdf", mimeType: "application/pdf", kind: "noc" });
    await ra.payments.linkNoc(pid!, noc.id);
    const rows = await db.select().from(schema.payment).where(eq(schema.payment.id, pid!));
    expect(rows[0]!.nocDocumentId).toBe(noc.id);

    const merged = await ra.payments.mergeFira(pid!, {
      firaRef: f("FIRA-9", 0.95),
      purposeCode: f("P0999", 0.99), // must not override the user's value
      payerName: f("Other", 0.5), // lower confidence than existing 1 -> ignored
    });
    expect(merged.firaRef.value).toBe("FIRA-9");
    expect(merged.purposeCode).toEqual({ value: "P0802", confidence: 1, source: "user" });
    expect(merged.payerName.value).toBe("Acme Inc");
    expect(await db.select().from(schema.fieldEdit)).toHaveLength(1); // only the user edit; system merges are not audited
  });
});

describe("CA access", () => {
  it("cannot read before accepting, can read after, cannot write, loses access on revoke", async () => {
    const ra = createRepos(db, owner(a.id));
    const [iid] = await ra.invoices.insertExtracted(null, [invoiceFacts()]);

    const rca = createRepos(db, ca(cuser.id, a.id));
    await expect(rca.invoices.listByMonth("2026-10")).rejects.toBeInstanceOf(NotFoundError);

    const { token } = await ra.shares.invite("ca@FIRM.test");
    await expect(rca.invoices.listByMonth("2026-10")).rejects.toBeInstanceOf(NotFoundError); // invited only

    const share = await createRepos(db, owner(cuser.id)).shares.accept(token);
    expect(share.status).toBe("accepted");
    expect((await rca.invoices.listByMonth("2026-10")).map((i) => i.id)).toEqual([iid]);
    expect((await rca.profile.get())).toBeNull();
    expect(await rca.banks.list()).toEqual([]);

    await expect(rca.invoices.updateField(iid!, "clientName", "X")).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rca.invoices.insertExtracted(null, [invoiceFacts()])).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rca.documents.create({ filename: "a", mimeType: "b" })).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rca.account.deleteAll()).rejects.toBeInstanceOf(ForbiddenError);
    await expect(rca.shares.invite("z@z.test")).rejects.toBeInstanceOf(ForbiddenError);

    await ra.shares.revoke(share.id);
    await expect(rca.invoices.listByMonth("2026-10")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("a CA of owner A cannot see owner B", async () => {
    await shareWithCa(a.id);
    const rb = createRepos(db, owner(b.id));
    await rb.invoices.insertExtracted(null, [invoiceFacts()]);
    const wrong = createRepos(db, ca(cuser.id, b.id));
    await expect(wrong.invoices.listByMonth("2026-10")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("only the invited email can accept, once, and not after revoke", async () => {
    const ra = createRepos(db, owner(a.id));
    const { token, id } = await ra.shares.invite("ca@firm.test");
    await expect(createRepos(db, owner(b.id)).shares.accept(token)).rejects.toBeInstanceOf(NotFoundError);
    await expect(createRepos(db, owner(cuser.id)).shares.accept("nope")).rejects.toBeInstanceOf(NotFoundError);
    await createRepos(db, owner(cuser.id)).shares.accept(token);

    const clients = await createRepos(db, owner(cuser.id)).shares.listForCa();
    expect(clients.map((c) => c.ownerUserId)).toEqual([a.id]);
    expect((await ra.shares.listForOwner()).map((s) => s.caEmail)).toEqual(["ca@firm.test"]);

    await expect(createRepos(db, owner(b.id)).shares.revoke(id)).rejects.toBeInstanceOf(NotFoundError);
    await ra.shares.revoke(id);
    expect(await createRepos(db, owner(cuser.id)).shares.listForCa()).toEqual([]);
    await expect(createRepos(db, owner(cuser.id)).shares.accept(token)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("countCasWithAtLeast counts CAs with n active clients", async () => {
    await shareWithCa(a.id);
    expect(await countCasWithAtLeast(db, 1)).toBe(1);
    expect(await countCasWithAtLeast(db, 2)).toBe(0);
    const { token } = await createRepos(db, owner(b.id)).shares.invite("ca@firm.test");
    await createRepos(db, owner(cuser.id)).shares.accept(token);
    expect(await countCasWithAtLeast(db, 2)).toBe(1);
  });
});

describe("allocations", () => {
  it("replaceProposed swaps proposals but keeps confirmed and rejected", async () => {
    const ra = createRepos(db, owner(a.id));
    const [i1, i2] = await ra.invoices.insertExtracted(null, [invoiceFacts(), invoiceFacts({ invoiceNo: f("INV-2") })]);
    const [p1, p2, p3] = await ra.payments.insertExtracted(null, [paymentFacts(), paymentFacts(), paymentFacts()]);
    const al = (invoiceId: string, paymentId: string, status: "proposed" | "confirmed" | "rejected" = "proposed") => ({
      invoiceId,
      paymentId,
      amount: { minor: 100n, currency: "USD" },
      score: 0.5,
      status,
    });

    await ra.allocations.replaceProposed([al(i1!, p1!), al(i1!, p2!), al(i2!, p3!)]);
    await ra.allocations.setStatus(i1!, p1!, "confirmed");
    await ra.allocations.setStatus(i1!, p2!, "rejected");

    // Re-run: old proposal i2/p3 for involved invoice i2 replaced; confirmed/rejected for i1 kept even if re-proposed.
    await ra.allocations.replaceProposed([al(i1!, p1!), al(i1!, p2!), al(i1!, p3!), al(i2!, p1!)]);
    const all = await ra.allocations.list();
    const key = (x: (typeof all)[number]) => `${x.invoiceId === i1 ? "i1" : "i2"}/${[p1, p2, p3].indexOf(x.paymentId) + 1}:${x.status}`;
    expect(all.map(key).sort()).toEqual(["i1/1:confirmed", "i1/2:rejected", "i1/3:proposed", "i2/1:proposed"]);

    await ra.allocations.replaceProposed([], { invoiceIds: [i2!] });
    expect((await ra.allocations.list()).map(key).sort()).toEqual(["i1/1:confirmed", "i1/2:rejected", "i1/3:proposed"]);

    expect((await ra.allocations.list("2026-10")).length).toBe(3);
    expect(await ra.allocations.list("2030-01")).toEqual([]);
    await expect(ra.allocations.setStatus(i2!, p2!, "confirmed")).rejects.toBeInstanceOf(NotFoundError);
  });

  it("rejects allocations referencing another user's invoice", async () => {
    const ra = createRepos(db, owner(a.id));
    const rb = createRepos(db, owner(b.id));
    const [iid] = await ra.invoices.insertExtracted(null, [invoiceFacts()]);
    const [pid] = await rb.payments.insertExtracted(null, [paymentFacts()]);
    await expect(
      rb.allocations.replaceProposed([
        { invoiceId: iid!, paymentId: pid!, amount: { minor: 1n, currency: "USD" }, score: 1, status: "proposed" },
      ]),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("documents and system queries", () => {
  it("requeueStuck is owner-scoped, counts one attempt per retry and fails exhausted documents", async () => {
    const ra = createRepos(db, owner(a.id));
    const rb = createRepos(db, owner(b.id));
    const t0 = new Date("2026-10-06T10:00:00Z");
    const t1 = new Date("2026-10-06T10:11:00Z");
    const cutoff = new Date(t1.getTime() - 10 * 60_000);
    const at = (uid: string, now: Date) => createRepos(db, owner(uid), { now: () => now });
    const mine = await ra.documents.create({ filename: "m.pdf", mimeType: "application/pdf" });
    const spent = await ra.documents.create({ filename: "s.pdf", mimeType: "application/pdf" });
    const theirs = await rb.documents.create({ filename: "t.pdf", mimeType: "application/pdf" });
    await at(a.id, t0).documents.setStatus(mine.id, "ingesting");
    for (let i = 0; i < 3; i++) await at(a.id, t0).documents.setStatus(spent.id, "ingesting");
    await at(b.id, t0).documents.setStatus(theirs.id, "ingesting");

    const r1 = await at(a.id, t1).documents.requeueStuck(cutoff, 3);
    expect(r1).toEqual({ requeued: [mine.id], failed: 1 });
    expect((await ra.documents.get(mine.id)).attempts).toBe(2);
    expect((await ra.documents.get(spent.id)).status).toBe("failed");
    expect((await rb.documents.get(theirs.id)).attempts).toBe(1); // other owner untouched
    // timer restarted: an immediate second call does nothing
    expect(await at(a.id, t1).documents.requeueStuck(cutoff, 3)).toEqual({ requeued: [], failed: 0 });
    expect((await ra.documents.get(mine.id)).attempts).toBe(2);
  });

  it("tracks status, attempts and finds stuck ingests", async () => {
    const ra = createRepos(db, owner(a.id));
    const doc = await ra.documents.create({ filename: "inv.pdf", mimeType: "application/pdf", month: "2026-10" });
    expect(doc.status).toBe("uploaded");
    expect(doc.blobKey).toBe(`u/${a.id}/${doc.id}/inv.pdf`);

    const t0 = new Date("2026-10-06T10:00:00Z");
    const timed = createRepos(db, owner(a.id), { now: () => t0 });
    await timed.documents.setStatus(doc.id, "ingesting");
    expect((await ra.documents.get(doc.id)).attempts).toBe(1);

    const later = new Date("2026-10-06T10:11:00Z");
    expect((await findStuckIngests(db, new Date(later.getTime() - 10 * 60_000), 3)).map((d) => d.id)).toEqual([doc.id]);
    expect(await findStuckIngests(db, new Date("2026-10-06T09:00:00Z"), 3)).toEqual([]);
    expect(await findStuckIngests(db, later, 1)).toEqual([]); // attempts exhausted
    expect(await failExhaustedIngests(db, later, 1)).toBe(1);
    const sys = await getDocumentForSystem(db, doc.id);
    expect(sys).toMatchObject({ userId: a.id, status: "failed" });
    expect(sys!.error).toMatch(/attempts/i);

    await ra.documents.setStatus(doc.id, "failed", "boom");
    expect((await ra.documents.get(doc.id)).error).toBe("boom");
    expect((await ra.documents.list("2026-10")).map((d) => d.id)).toEqual([doc.id]);
    expect(await ra.documents.list("2026-09")).toEqual([]);
    expect(await getDocumentForSystem(db, "missing")).toBeNull();
  });
});

describe("notifications", () => {
  it("dedupes by key", async () => {
    expect(await recordNotification(db, a.id, "edf_due:2026-10:d10")).toBe(true);
    expect(await recordNotification(db, a.id, "edf_due:2026-10:d10")).toBe(false);
    expect(await recordNotification(db, a.id, "edf_due:2026-10:d3")).toBe(true);
  });

  it("lists schedule state", async () => {
    const ra = createRepos(db, owner(a.id));
    const [i1] = await ra.invoices.insertExtracted(null, [invoiceFacts()]);
    await ra.invoices.insertExtracted(null, [invoiceFacts({ invoiceDate: f("2026-09-01"), adBankId: f("bank-1") })]);
    const [p1] = await ra.payments.insertExtracted(null, [paymentFacts()]);
    await ra.allocations.replaceProposed([
      { invoiceId: i1!, paymentId: p1!, amount: { minor: 5n, currency: "USD" }, score: 1, status: "proposed" },
    ]);
    await ra.allocations.setStatus(i1!, p1!, "confirmed");
    await ra.packs.create({ month: "2026-09", adBankId: "bank-1", layoutId: "generic", files: [] }).then((p) =>
      ra.packs.markSubmitted(p.id),
    );

    const state = await listNotificationState(db);
    const sa = state.find((u) => u.userId === a.id)!;
    expect(sa.email).toBe("a@example.test");
    expect(sa.months).toEqual([
      { month: "2026-09", hasDeclaredInvoices: true, submitted: true },
      { month: "2026-10", hasDeclaredInvoices: true, submitted: false },
    ]);
    const inv = sa.invoices.find((x) => x.facts.id === i1)!;
    expect(inv.allocations).toHaveLength(1);
    expect(inv.allocations[0]!.amount.minor).toBe(5n);
    expect(state.find((u) => u.userId === b.id)).toMatchObject({ months: [], invoices: [] });
  });
});

describe("profile, banks, packs, account deletion", () => {
  it("round-trips profile and banks", async () => {
    const ra = createRepos(db, owner(a.id));
    expect(await ra.profile.get()).toBeNull();
    const bank = await ra.banks.upsert({ name: "ICICI", adCode: "6390" });
    await ra.profile.upsert({
      legalName: "Jane Ltd",
      address: "Pune",
      pan: "ABCDE1234F",
      gstin: "27ABCDE1234F1Z5",
      iec: null,
      defaultSacCodes: ["998314"],
      defaultAdBankId: bank.id,
    });
    expect((await ra.profile.get())!.defaultSacCodes).toEqual(["998314"]);
    await ra.banks.upsert({ ...bank, name: "ICICI Bank" });
    expect((await ra.banks.list()).map((x) => x.name)).toEqual(["ICICI Bank"]);
    expect(await createRepos(db, owner(b.id)).banks.list()).toEqual([]);
    // Another user cannot hijack the id.
    await expect(createRepos(db, owner(b.id)).banks.upsert({ ...bank, name: "x" })).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deleteAll returns every blob key and cascades", async () => {
    const ra = createRepos(db, owner(a.id));
    const rb = createRepos(db, owner(b.id));
    const d1 = await ra.documents.create({ filename: "inv.pdf", mimeType: "application/pdf" });
    const [iid] = await ra.invoices.insertExtracted(d1.id, [invoiceFacts()]);
    const [pid] = await ra.payments.insertExtracted(d1.id, [paymentFacts()]);
    await ra.allocations.replaceProposed([
      { invoiceId: iid!, paymentId: pid!, amount: { minor: 1n, currency: "USD" }, score: 1, status: "proposed" },
    ]);
    await ra.invoices.updateField(iid!, "clientName", "Z");
    await ra.packs.create({
      month: "2026-10",
      adBankId: "bank-1",
      layoutId: "generic",
      files: [{ name: "EDF.pdf", mimeType: "application/pdf", blobKey: "u/a/packs/EDF.pdf" }],
    });
    await ra.shares.invite("ca@firm.test");
    await rb.invoices.insertExtracted(null, [invoiceFacts()]);

    const keys = await ra.account.deleteAll();
    expect(keys.sort()).toEqual([d1.blobKey, "u/a/packs/EDF.pdf"].sort());

    for (const t of [schema.invoice, schema.payment, schema.document, schema.pack, schema.fieldEdit]) {
      expect((await db.select().from(t)).filter((r) => r.userId === a.id)).toEqual([]);
    }
    expect(await db.select().from(schema.allocation)).toEqual([]);
    expect(await db.select().from(schema.caShare)).toEqual([]);
    expect((await db.select().from(schema.user)).map((u) => u.id)).not.toContain(a.id);
    expect(await rb.invoices.listByMonth("2026-10")).toHaveLength(1);
  });

  it("packs: create, list, get, markSubmitted with ack document", async () => {
    const ra = createRepos(db, owner(a.id));
    const p = await ra.packs.create({ month: "2026-10", adBankId: "bank-1", layoutId: "generic", files: [] });
    expect(p.status).toBe("generated");
    const ack = await ra.documents.create({ filename: "ack.pdf", mimeType: "application/pdf" });
    const sub = await ra.packs.markSubmitted(p.id, ack.id);
    expect(sub).toMatchObject({ status: "submitted", ackDocumentId: ack.id });
    expect(sub.submittedAt).toBeInstanceOf(Date);
    expect((await ra.packs.list("2026-10")).map((x) => x.id)).toEqual([p.id]);
    await expect(createRepos(db, owner(b.id)).packs.get(p.id)).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe("row level security", () => {
  it("is enabled on every table with no policies", async () => {
    const res = await db.execute<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and c.relname not like '\\_\\_%'`,
    );
    const rows = (res as unknown as { rows: { relname: string; relrowsecurity: boolean }[] }).rows;
    expect(rows.length).toBe(schema.TABLE_NAMES.length);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
    const pol = (await db.execute(`select 1 from pg_policies`)) as unknown as { rows: unknown[] };
    expect(pol.rows).toEqual([]);
  });
});

describe("re-ingest support", () => {
  it("deleteExtracted removes a document's rows, but refuses once the user has edited or decided them", async () => {
    const ra = createRepos(db, owner(a.id));
    const doc = await ra.documents.create({ filename: "x.pdf", mimeType: "application/pdf", month: "2026-10" });
    const [iid] = await ra.invoices.insertExtracted(doc.id, [invoiceFacts()]);
    const [pid] = await ra.payments.insertExtracted(doc.id, [paymentFacts()]);
    expect(await ra.documents.deleteExtracted(doc.id)).toEqual({ invoices: 1, payments: 1 });
    expect(await ra.invoices.list()).toEqual([]);
    expect(await ra.payments.list()).toEqual([]);

    const [i2] = await ra.invoices.insertExtracted(doc.id, [invoiceFacts()]);
    await ra.invoices.updateField(i2!, "clientName", "Edited");
    await expect(ra.documents.deleteExtracted(doc.id)).rejects.toBeInstanceOf(ValidationError);
    expect(await ra.invoices.list()).toHaveLength(1);
    void iid; void pid;

    const rb = createRepos(db, owner(b.id));
    await expect(rb.documents.deleteExtracted(doc.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("deleteExtracted refuses after a confirmed allocation", async () => {
    const ra = createRepos(db, owner(a.id));
    const doc = await ra.documents.create({ filename: "x.pdf", mimeType: "application/pdf" });
    const [iid] = await ra.invoices.insertExtracted(doc.id, [invoiceFacts()]);
    const [pid] = await ra.payments.insertExtracted(null, [paymentFacts()]);
    await ra.allocations.replaceProposed([{ invoiceId: iid!, paymentId: pid!, amount: { minor: 1n, currency: "USD" }, score: 1, status: "proposed" }]);
    await ra.allocations.setStatus(iid!, pid!, "confirmed");
    await expect(ra.documents.deleteExtracted(doc.id)).rejects.toBeInstanceOf(ValidationError);
  });

  it("listForMonth includes undated invoices of that month's documents; links() exposes document ids", async () => {
    const ra = createRepos(db, owner(a.id));
    const doc = await ra.documents.create({ filename: "u.pdf", mimeType: "application/pdf", month: "2026-10" });
    const other = await ra.documents.create({ filename: "o.pdf", mimeType: "application/pdf", month: "2026-09" });
    await ra.invoices.insertExtracted(doc.id, [invoiceFacts({ invoiceDate: f<string>(null, 0) })]);
    await ra.invoices.insertExtracted(other.id, [invoiceFacts({ invoiceDate: f<string>(null, 0) })]);
    await ra.invoices.insertExtracted(null, [invoiceFacts()]);
    const rows = await ra.invoices.listForMonth("2026-10");
    expect(rows.map((r) => r.undated).sort()).toEqual([false, true]);
    expect(rows.find((r) => r.undated)!.documentId).toBe(doc.id);

    const noc = await ra.documents.create({ filename: "n.pdf", mimeType: "application/pdf" });
    const [pid] = await ra.payments.insertExtracted(doc.id, [paymentFacts()]);
    await ra.payments.linkNoc(pid!, noc.id);
    expect((await ra.payments.links())[pid!]).toEqual({ documentId: doc.id, nocDocumentId: noc.id });
  });

  it("monthsByDocument lists each document's distinct invoice-date months, ascending, owner-scoped", async () => {
    const ra = createRepos(db, owner(a.id));
    const d1 = await ra.documents.create({ filename: "1.pdf", mimeType: "application/pdf", month: "2026-10" });
    const d2 = await ra.documents.create({ filename: "2.pdf", mimeType: "application/pdf", month: "2026-10" });
    const d3 = await ra.documents.create({ filename: "3.pdf", mimeType: "application/pdf", month: "2026-10" });
    await ra.invoices.insertExtracted(d1.id, [
      invoiceFacts({ invoiceDate: f("2026-06-02") }), invoiceFacts({ invoiceDate: f("2026-04-10") }), invoiceFacts({ invoiceDate: f("2026-06-20") }), invoiceFacts({ invoiceDate: f<string>(null, 0) }),
    ]);
    await ra.invoices.insertExtracted(d2.id, [invoiceFacts({ invoiceDate: f<string>(null, 0) })]);
    expect(await ra.invoices.monthsByDocument([d1.id, d2.id, d3.id])).toEqual({ [d1.id]: ["2026-04", "2026-06"] });
    expect(await ra.invoices.monthsByDocument([])).toEqual({});
    expect(await createRepos(db, owner(b.id)).invoices.monthsByDocument([d1.id])).toEqual({});
  });

  it("packs.create accepts a caller-chosen id", async () => {
    const ra = createRepos(db, owner(a.id));
    const p = await ra.packs.create({ id: "pack-xyz", month: "2026-10", adBankId: "bank-1", layoutId: "generic", files: [] });
    expect(p.id).toBe("pack-xyz");
  });
});
