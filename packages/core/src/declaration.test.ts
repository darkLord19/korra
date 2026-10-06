import { describe, expect, it } from "vitest";
import {
  assessDeclaration,
  money,
  quarterLabel,
  quarterOf,
  quarterRange,
  realisationOf,
  type DeclarationBlocker,
  type DeclarationCandidate,
  type DeclarationDraft,
  type DeclarationPeriod,
  type Quarter,
  type ReadyDeclaration,
  type ReductionChoice,
} from "./index";
import { alloc, bank, exporter, f, invoice, payment } from "./fixtures.test-util";

const NOW = new Date("2027-01-05T10:00:00.000Z");
const inr = (rupees: number) => money(BigInt(rupees) * 100n, "INR");

interface CandOpts {
  date?: string; // invoice date
  payDate?: string | null; // confirmed payment covering the full amount; null = no payment
  partial?: boolean; // pay only half
  inr?: number | null;
  inrField?: { confidence: number; source: "extracted" | "user" | "default" };
  choice?: ReductionChoice;
  invoiceNo?: string;
}

function cand(id: string, o: CandOpts = {}): DeclarationCandidate {
  const inv = invoice(id, { date: o.date ?? "2026-10-05" });
  if (o.invoiceNo) inv.invoiceNo = f(o.invoiceNo);
  const rupees = o.inr === undefined ? 50_000 : o.inr;
  inv.inrEquivalent = f(
    rupees === null ? null : inr(rupees),
    o.inrField?.confidence ?? 1,
    o.inrField?.source ?? "user",
  );
  const payDate = o.payDate === undefined ? "2026-11-10" : o.payDate;
  const pays = payDate === null ? [] : [payment(`p-${id}`, { date: payDate })];
  const allocs = payDate === null ? [] : [alloc(id, `p-${id}`, o.partial ? money(40000, "USD") : money(100000, "USD"), "confirmed")];
  return {
    invoice: inv,
    edfMonth: "2026-10",
    realisation: realisationOf(inv, allocs, "2027-01-05"),
    allocations: allocs,
    payments: pays,
    reductionChoice: o.choice ?? "none",
  };
}

const draft = (candidates: DeclarationCandidate[], period: DeclarationPeriod = "2026-Q4"): DeclarationDraft => ({
  period,
  adBank: bank,
  exporter,
  candidates,
});
const ok = (d: DeclarationDraft): ReadyDeclaration => {
  const r = assessDeclaration(d, NOW);
  if (!r.ok) throw new Error(JSON.stringify(r.blockers, (_, v) => (typeof v === "bigint" ? String(v) : v)));
  return r.declaration;
};
const blockers = (d: DeclarationDraft): DeclarationBlocker[] => {
  const r = assessDeclaration(d, NOW);
  if (r.ok) throw new Error("expected blockers");
  return r.blockers;
};

describe("quarters", () => {
  it.each([
    ["2026-01-01", "2026-Q1"],
    ["2026-03-31", "2026-Q1"],
    ["2026-04-01", "2026-Q2"],
    ["2026-09-30", "2026-Q3"],
    ["2026-10-01", "2026-Q4"],
    ["2026-12-31", "2026-Q4"],
  ])("quarterOf(%s) = %s", (d, q) => expect(quarterOf(d)).toBe(q));

  it.each([
    ["2026-Q1", "2026-01-01", "2026-03-31"],
    ["2026-Q2", "2026-04-01", "2026-06-30"],
    ["2026-Q3", "2026-07-01", "2026-09-30"],
    ["2026-Q4", "2026-10-01", "2026-12-31"],
    ["2028-Q1", "2028-01-01", "2028-03-31"],
  ] as [Quarter, string, string][])("quarterRange(%s)", (q, start, end) =>
    expect(quarterRange(q)).toEqual({ start, end }),
  );

  it.each([
    ["2026-Q1", "Jan–Mar 2026 (Q4 FY 2025-26)"],
    ["2026-Q2", "Apr–Jun 2026 (Q1 FY 2026-27)"],
    ["2026-Q3", "Jul–Sep 2026 (Q2 FY 2026-27)"],
    ["2026-Q4", "Oct–Dec 2026 (Q3 FY 2026-27)"],
    ["2099-Q1", "Jan–Mar 2099 (Q4 FY 2098-99)"],
  ] as [Quarter, string][])("quarterLabel(%s)", (q, label) => expect(quarterLabel(q)).toBe(label));

  it("rejects malformed quarters", () => {
    expect(() => quarterRange("2026-Q5" as Quarter)).toThrow();
  });
});

describe("assessDeclaration", () => {
  it("includes a realised invoice paid in the quarter, with evidence", () => {
    const d = ok(draft([cand("a")]));
    expect(d.periodLabel).toBe("Oct–Dec 2026 (Q3 FY 2026-27)");
    expect(d.generatedAt).toBe(NOW.toISOString());
    expect(d.rows).toHaveLength(1);
    expect(d.rows[0]).toMatchObject({
      invoiceNo: "INV-a",
      edfMonth: "2026-10",
      clientName: "Acme Inc",
      currency: "USD",
      invoiceAmount: money(100000, "USD"),
      inrEquivalent: inr(50_000),
      realisedAmount: money(100000, "USD"),
      status: "realised_in_full",
      evidence: { paymentDates: "2026-11-10", references: "Deel withdrawal 2026-11-10", receiptModes: "Local transfer" },
    });
  });

  it("uses the FIRA ref over the Deel fallback and the latest allocation date for the quarter", () => {
    const c = cand("a", { payDate: "2026-09-20" });
    const p2 = payment("p2", { date: "2026-10-12" });
    p2.rail = "generic";
    p2.receiptMode = f<"local_transfer" | "swift">("swift");
    p2.firaRef = f("FIRA-9");
    c.payments.push(p2);
    c.allocations.push(alloc("a", "p2", money(1, "USD"), "confirmed"));
    const d = ok(draft([c]));
    expect(d.rows[0]?.evidence).toEqual({
      paymentDates: "2026-09-20, 2026-10-12",
      references: "Deel withdrawal 2026-09-20; FIRA-9",
      receiptModes: "Local transfer, SWIFT",
    });
    // latest payment is in Q4, so Q3 excludes it
    expect(blockers(draft([c], "2026-Q3"))).toEqual([{ kind: "no_eligible_invoices" }]);
  });

  it("excludes a realised invoice paid outside the quarter, silently", () => {
    const r = assessDeclaration(draft([cand("a", { payDate: "2026-09-30" }), cand("b", { payDate: "2026-12-15" })]), NOW);
    if (!r.ok) throw new Error("not ok");
    expect(r.declaration.rows.map((x) => x.invoiceId)).toEqual(["b"]);
    expect(r.declaration.warnings).toEqual([]);
  });

  it("quarter: over-limit is excluded and warned; single-invoice: it blocks", () => {
    const big = cand("big", { inr: 10_00_001 });
    const small = cand("small");
    const d = ok(draft([big, small]));
    expect(d.rows.map((r) => r.invoiceId)).toEqual(["small"]);
    expect(d.warnings).toEqual([
      { kind: "excluded_over_limit", invoiceId: "big", invoiceNo: "INV-big", inrEquivalent: inr(10_00_001) },
    ]);
    expect(blockers(draft([big], { invoiceId: "big" }))).toEqual([
      { kind: "over_limit", invoiceId: "big", inrEquivalent: inr(10_00_001) },
    ]);
  });

  it("exactly INR 10 lakh is eligible (limit is inclusive) and near-limit warns", () => {
    const d = ok(draft([cand("edge", { inr: 10_00_000 }), cand("low", { inr: 9_00_000 }), cand("far", { inr: 8_99_999 })]));
    expect(d.rows.map((r) => r.invoiceId).sort()).toEqual(["edge", "far", "low"]);
    expect(d.warnings.map((w) => [w.kind, w.invoiceId])).toEqual([
      ["near_limit", "edge"],
      ["near_limit", "low"],
    ]);
  });

  it("missing or flagged INR equivalent blocks; user-set value is trusted", () => {
    expect(blockers(draft([cand("a", { inr: null })]))).toEqual([{ kind: "missing_inr_equivalent", invoiceId: "a" }]);
    const flagged = cand("b", { inrField: { confidence: 0.7, source: "default" } });
    expect(blockers(draft([flagged]))).toEqual([{ kind: "flagged_inr_equivalent", invoiceId: "b", confidence: 0.7 }]);
    const edited = cand("c", { inrField: { confidence: 0.7, source: "user" } });
    expect(ok(draft([edited])).rows).toHaveLength(1);
    // a non-INR "INR equivalent" is treated as missing
    const wrong = cand("d");
    wrong.invoice.inrEquivalent = f(money(5000, "USD"));
    expect(blockers(draft([wrong]))).toEqual([{ kind: "missing_inr_equivalent", invoiceId: "d" }]);
  });

  it("partial with a reduction choice is included with the matching status", () => {
    const d = ok(
      draft([
        cand("p", { partial: true, choice: "reduction" }),
        cand("n", { payDate: null, choice: "non_realisation", date: "2026-03-01" }),
      ]),
    );
    expect(d.rows.map((r) => [r.invoiceId, r.status])).toEqual([
      ["n", "not_realised_reduction"],
      ["p", "partly_realised_reduction"],
    ]);
    expect(d.rows.find((r) => r.invoiceId === "p")?.realisedAmount).toEqual(money(40000, "USD"));
  });

  it("reduction choice on an invoice dated after the quarter end is not included", () => {
    expect(blockers(draft([cand("late", { payDate: null, choice: "non_realisation", date: "2027-01-02" })]))).toEqual([
      { kind: "no_eligible_invoices" },
    ]);
  });

  it("partial/open without a choice: excluded and warned in a quarter, blocks a single invoice", () => {
    const p = cand("p", { partial: true });
    const o = cand("o", { payDate: null });
    const d = ok(draft([p, o, cand("a")]));
    expect(d.rows.map((r) => r.invoiceId)).toEqual(["a"]);
    expect(d.warnings.map((w) => [w.kind, w.invoiceId])).toEqual([
      ["excluded_unresolved", "o"],
      ["excluded_unresolved", "p"],
    ]);
    expect(blockers(draft([p], { invoiceId: "p" }))).toEqual([{ kind: "unresolved_partial", invoiceId: "p" }]);
  });

  it("single-invoice period includes only that invoice regardless of payment date", () => {
    const d = ok(draft([cand("a", { payDate: "2026-02-01" }), cand("b")], { invoiceId: "a" }));
    expect(d.rows.map((r) => r.invoiceId)).toEqual(["a"]);
    expect(d.periodLabel).toBe("Invoice INV-a");
    expect(d.period).toEqual({ invoiceId: "a" });
  });

  it("empty or nothing eligible gives no_eligible_invoices; unknown single invoice too", () => {
    expect(blockers(draft([]))).toEqual([{ kind: "no_eligible_invoices" }]);
    expect(blockers(draft([cand("a")], { invoiceId: "zzz" }))).toEqual([{ kind: "no_eligible_invoices" }]);
  });

  it("blocks on missing exporter fields", () => {
    const d = { ...draft([cand("a")]), exporter: { ...exporter, pan: "", gstin: " " } };
    expect(blockers(d)).toEqual([
      { kind: "missing_exporter_field", field: "pan" },
      { kind: "missing_exporter_field", field: "gstin" },
    ]);
  });

  it("orders rows by invoice date then number, regardless of input order", () => {
    const a = cand("a", { date: "2026-10-10", invoiceNo: "B-2" });
    const b = cand("b", { date: "2026-10-02", invoiceNo: "Z-9" });
    const c = cand("c", { date: "2026-10-10", invoiceNo: "A-1" });
    const one = ok(draft([a, b, c])).rows.map((r) => r.invoiceNo);
    const two = ok(draft([c, a, b])).rows.map((r) => r.invoiceNo);
    expect(one).toEqual(["Z-9", "A-1", "B-2"]);
    expect(two).toEqual(one);
  });

  it("cannot be forged outside assessDeclaration", () => {
    const rd: ReadyDeclaration = ok(draft([cand("a")]));
    // @ts-expect-error a plain object literal lacks the brand
    const forged: ReadyDeclaration = { period: "2026-Q4", periodLabel: "", adBank: bank, exporter, rows: [], warnings: [], generatedAt: "" };
    expect(rd).toBeDefined();
    expect(forged).toBeDefined();
  });
});
