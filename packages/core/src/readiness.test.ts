import { describe, expect, it } from "vitest";
import { assessPack, FLAG_THRESHOLD, money } from "./index";
import type { Blocker, PackDraft, ReadyPack } from "./index";
import { bank, exporter, f, invoice } from "./fixtures.test-util";

const NOW = new Date("2026-11-02T10:00:00.000Z");
const draft = (over: Partial<PackDraft> = {}): PackDraft => ({
  month: "2026-10",
  adBank: bank,
  exporter,
  invoices: [invoice("i1")],
  pendingDocumentIds: [],
  ...over,
});
const blockers = (d: PackDraft): Blocker[] => {
  const r = assessPack(d, NOW);
  if (r.ok) throw new Error("expected blockers");
  return r.blockers;
};

describe("assessPack", () => {
  it("ok pack with rows and generatedAt", () => {
    const r = assessPack(draft(), NOW);
    if (!r.ok) throw new Error(JSON.stringify(r));
    expect(r.pack.generatedAt).toBe("2026-11-02T10:00:00.000Z");
    expect(r.pack.rows).toHaveLength(1);
    expect(r.pack.rows[0]).toMatchObject({
      exporterLegalName: "Jane Dev",
      exporterIec: null,
      invoiceNo: "INV-i1",
      invoiceAmount: money(100000, "USD"),
      contractRef: null,
      sacCode: "998314",
    });
  });

  it("rows sorted by invoiceDate then invoiceNo; excludes other month and bank", () => {
    const a = invoice("a", { date: "2026-10-10" });
    const b = invoice("b", { date: "2026-10-02" });
    const c = invoice("c", { date: "2026-10-10" });
    c.invoiceNo = f("INV-A0");
    const other = invoice("d", { date: "2026-09-30" });
    const otherBank = invoice("e", { bank: "bank2" });
    const r = assessPack(draft({ invoices: [a, other, c, otherBank, b] }), NOW);
    if (!r.ok) throw new Error("not ok");
    expect(r.pack.rows.map((x) => x.invoiceNo)).toEqual(["INV-b", "INV-A0", "INV-a"]);
  });

  it("no_invoices when none match month and bank", () => {
    expect(blockers(draft({ invoices: [] }))).toEqual([{ kind: "no_invoices" }]);
    const unrelated = [invoice("x", { date: "2026-09-30" }), invoice("y", { bank: "b2" })];
    expect(blockers(draft({ invoices: unrelated }))).toEqual([{ kind: "no_invoices" }]);
  });

  it("missing exporter and invoice fields", () => {
    const inv = invoice("i1");
    inv.sacCode = f<string>(null);
    inv.clientName = f("   ");
    const bs = blockers(draft({ invoices: [inv], exporter: { ...exporter, pan: "" } }));
    expect(bs).toContainEqual({ kind: "missing_field", entity: "exporter", id: "", field: "pan" });
    expect(bs).toContainEqual({ kind: "missing_field", entity: "invoice", id: "i1", field: "sacCode" });
    expect(bs).toContainEqual({ kind: "missing_field", entity: "invoice", id: "i1", field: "clientName" });
    expect(bs).toHaveLength(3);
  });

  it("optional contractRef never blocks when empty", () => {
    const inv = invoice("i1");
    inv.contractRef = f<string>(null, 0, "default");
    expect(assessPack(draft({ invoices: [inv] }), NOW).ok).toBe(true);
  });

  it("flags low-confidence non-user fields, including optional with a value", () => {
    const inv = invoice("i1");
    inv.amount = f(money(5, "USD"), FLAG_THRESHOLD - 0.01);
    inv.clientName = f("Acme", 0.2, "user"); // user-edited: fine
    inv.contractRef = f("C-1", 0.5);
    inv.sacCode = f("9983", FLAG_THRESHOLD); // at threshold: fine
    expect(blockers(draft({ invoices: [inv] }))).toEqual([
      { kind: "flagged_field", entity: "invoice", id: "i1", field: "amount", confidence: FLAG_THRESHOLD - 0.01 },
      { kind: "flagged_field", entity: "invoice", id: "i1", field: "contractRef", confidence: 0.5 },
    ]);
  });

  it("pending documents block", () => {
    expect(blockers(draft({ pendingDocumentIds: ["d1", "d2"] }))).toEqual([
      { kind: "document_pending", documentId: "d1" },
      { kind: "document_pending", documentId: "d2" },
    ]);
  });

  it("reports blockers together", () => {
    const bs = blockers(draft({ invoices: [], pendingDocumentIds: ["d1"], exporter: { ...exporter, gstin: "" } }));
    expect(bs.map((b) => b.kind).sort()).toEqual(["document_pending", "missing_field", "no_invoices"]);
  });

  it("ReadyPack cannot be constructed outside the module", () => {
    const plain = { ...draft(), generatedAt: "x", rows: [] };
    // @ts-expect-error a plain object is not a ReadyPack (branded)
    const bad: ReadyPack = plain;
    expect(bad).toBe(plain);
  });
});
