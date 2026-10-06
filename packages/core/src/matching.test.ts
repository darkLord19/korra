import { describe, expect, it } from "vitest";
import { money, proposeMatches } from "./index";
import type { Allocation, InvoiceFacts, PaymentFacts } from "./index";
import { alloc, invoice, payment } from "./fixtures.test-util";

const usd = (n: number) => money(n, "USD");
const pairs = (a: Allocation[]) => a.map((x) => `${x.invoiceId}<-${x.paymentId}:${x.amount.minor}:${x.status}`);

describe("proposeMatches", () => {
  it("1:1 exact", () => {
    const r = proposeMatches([invoice("i1")], [payment("p1")], []);
    expect(pairs(r.allocations)).toEqual(["i1<-p1:100000:proposed"]);
    expect(r.allocations[0]!.score).toBeGreaterThan(0.9);
    expect(r.unmatchedInvoiceIds).toEqual([]);
    expect(r.unmatchedPaymentIds).toEqual([]);
  });

  it("1:1 within fee tolerance (payment short by fees)", () => {
    const r = proposeMatches([invoice("i1")], [payment("p1", { amount: usd(98000) })], []);
    expect(pairs(r.allocations)).toEqual(["i1<-p1:98000:proposed"]);
  });

  it("1:1 uses fees when payment + fees equals invoice", () => {
    const r = proposeMatches(
      [invoice("i1", { amount: usd(100000) })],
      [payment("p1", { amount: usd(95000), fees: usd(5000) })],
      [],
    );
    expect(pairs(r.allocations)).toEqual(["i1<-p1:100000:proposed"]);
  });

  it("outside tolerance does not match", () => {
    const r = proposeMatches([invoice("i1")], [payment("p1", { amount: usd(90000) })], []);
    expect(r.allocations).toEqual([]);
    expect(r.unmatchedInvoiceIds).toEqual(["i1"]);
    expect(r.unmatchedPaymentIds).toEqual(["p1"]);
  });

  it("custom tolerance", () => {
    const r = proposeMatches([invoice("i1")], [payment("p1", { amount: usd(90000) })], [], { amountPct: 0.12 });
    expect(r.allocations).toHaveLength(1);
  });

  it("cross-currency never matches", () => {
    const r = proposeMatches([invoice("i1")], [payment("p1", { amount: money(100000, "EUR") })], []);
    expect(r.allocations).toEqual([]);
    expect(r.unmatchedInvoiceIds).toEqual(["i1"]);
    expect(r.unmatchedPaymentIds).toEqual(["p1"]);
  });

  it("N:1 Deel batch withdrawal: one payment covers three invoices of one client", () => {
    const invs = [
      invoice("i1", { amount: usd(30000), date: "2026-09-01" }),
      invoice("i2", { amount: usd(45000), date: "2026-09-10" }),
      invoice("i3", { amount: usd(25000), date: "2026-09-20" }),
      invoice("i4", { amount: usd(77700), date: "2026-09-20" }),
    ];
    const r = proposeMatches(invs, [payment("p1", { amount: usd(100000), payer: "Acme Inc.", date: "2026-10-05" })], []);
    expect(pairs(r.allocations)).toEqual([
      "i1<-p1:30000:proposed",
      "i2<-p1:45000:proposed",
      "i3<-p1:25000:proposed",
    ]);
    expect(r.unmatchedInvoiceIds).toEqual(["i4"]);
    expect(r.unmatchedPaymentIds).toEqual([]);
  });

  it("N:1 never mixes clients", () => {
    const invs = [
      invoice("i1", { amount: usd(30000), client: "Acme Inc" }),
      invoice("i2", { amount: usd(70000), client: "Globex LLC" }),
    ];
    const r = proposeMatches(invs, [payment("p1", { amount: usd(100000), payer: "Acme" })], []);
    expect(r.allocations).toEqual([]);
  });

  it("1:N partial payments cover one invoice", () => {
    const r = proposeMatches(
      [invoice("i1", { amount: usd(100000) })],
      [payment("p1", { amount: usd(40000) }), payment("p2", { amount: usd(60000), date: "2026-11-15" })],
      [],
    );
    expect(pairs(r.allocations)).toEqual(["i1<-p1:40000:proposed", "i1<-p2:60000:proposed"]);
    expect(r.unmatchedPaymentIds).toEqual([]);
  });

  it("rejected pair is never re-proposed and is kept verbatim", () => {
    const rejected = alloc("i1", "p1", usd(100000), "rejected", 0.8);
    const r = proposeMatches([invoice("i1")], [payment("p1")], [rejected]);
    expect(r.allocations).toEqual([rejected]);
    expect(r.unmatchedInvoiceIds).toEqual(["i1"]);
    expect(r.unmatchedPaymentIds).toEqual(["p1"]);
  });

  it("rejected pair steers to the other candidate", () => {
    const r = proposeMatches(
      [invoice("i1")],
      [payment("p1"), payment("p2")],
      [alloc("i1", "p1", usd(100000), "rejected")],
    );
    expect(pairs(r.allocations)).toEqual(["i1<-p1:100000:rejected", "i1<-p2:100000:proposed"]);
    expect(r.unmatchedPaymentIds).toEqual(["p1"]);
  });

  it("confirmed allocation is preserved and its amount subtracted from the invoice", () => {
    const confirmed = alloc("i1", "p1", usd(40000), "confirmed");
    const r = proposeMatches(
      [invoice("i1")],
      [payment("p1", { amount: usd(40000) }), payment("p2", { amount: usd(60000) })],
      [confirmed],
    );
    expect(pairs(r.allocations)).toEqual(["i1<-p1:40000:confirmed", "i1<-p2:60000:proposed"]);
    expect(r.allocations).toContainEqual(confirmed);
  });

  it("payment remaining is reduced by confirmed allocations", () => {
    const r = proposeMatches(
      [invoice("i1", { amount: usd(70000) }), invoice("i2", { amount: usd(30000) })],
      [payment("p1", { amount: usd(100000) })],
      [alloc("i1", "p1", usd(70000), "confirmed")],
    );
    expect(pairs(r.allocations)).toEqual(["i1<-p1:70000:confirmed", "i2<-p1:30000:proposed"]);
    expect(r.unmatchedInvoiceIds).toEqual([]);
    expect(r.unmatchedPaymentIds).toEqual([]);
  });

  it("fully confirmed invoice is not re-proposed or unmatched", () => {
    const r = proposeMatches(
      [invoice("i1")],
      [payment("p1"), payment("p2")],
      [alloc("i1", "p1", usd(100000), "confirmed")],
    );
    expect(pairs(r.allocations)).toEqual(["i1<-p1:100000:confirmed"]);
    expect(r.unmatchedInvoiceIds).toEqual([]);
    expect(r.unmatchedPaymentIds).toEqual(["p2"]);
  });

  it("existing proposed allocations are discarded and recomputed", () => {
    const stale = alloc("i1", "p2", usd(100000), "proposed");
    const r = proposeMatches([invoice("i1")], [payment("p1")], [stale]);
    expect(pairs(r.allocations)).toEqual(["i1<-p1:100000:proposed"]);
  });

  it("prefers the payment whose payer matches the client when amounts tie", () => {
    const pays = [payment("p1", { payer: "Globex LLC" }), payment("p2", { payer: "ACME, Inc." })];
    const r = proposeMatches([invoice("i1", { client: "Acme Inc" })], pays, []);
    expect(pairs(r.allocations)).toEqual(["i1<-p2:100000:proposed"]);
    expect(r.unmatchedPaymentIds).toEqual(["p1"]);
  });

  it("unrelated client name scores lower than a related one", () => {
    const related = proposeMatches([invoice("i1")], [payment("p1", { payer: "Acme Pvt Ltd" })], []);
    const unrelated = proposeMatches([invoice("i1")], [payment("p1", { payer: "Zeta GmbH" })], []);
    expect(related.allocations[0]!.score).toBeGreaterThan(unrelated.allocations[0]!.score);
  });

  it("an unrelated-name candidate does not win over a better candidate", () => {
    const r = proposeMatches(
      [invoice("i1", { amount: usd(100000) }), invoice("i2", { amount: usd(100000), client: "Globex LLC" })],
      [payment("p1", { payer: "Globex" })],
      [],
    );
    expect(pairs(r.allocations)).toEqual(["i2<-p1:100000:proposed"]);
    expect(r.unmatchedInvoiceIds).toEqual(["i1"]);
  });

  it("payments outside the date window do not match", () => {
    const inv = invoice("i1", { date: "2026-01-10" });
    expect(proposeMatches([inv], [payment("p1", { date: "2026-01-02" })], []).allocations).toEqual([]);
    expect(proposeMatches([inv], [payment("p1", { date: "2026-01-03" })], []).allocations).toHaveLength(1);
    expect(proposeMatches([inv], [payment("p1", { date: "2026-10-07" })], []).allocations).toHaveLength(1);
    expect(proposeMatches([inv], [payment("p1", { date: "2026-10-08" })], []).allocations).toEqual([]);
  });

  it("skips invoices and payments with missing needed fields", () => {
    const r = proposeMatches(
      [invoice("i1", { date: null }), invoice("i2", { amount: null }), invoice("i3")],
      [payment("p1", { amount: null }), payment("p2", { date: null }), payment("p3")],
      [],
    );
    expect(pairs(r.allocations)).toEqual(["i3<-p3:100000:proposed"]);
    expect(r.unmatchedInvoiceIds).toEqual(["i1", "i2"]);
    expect(r.unmatchedPaymentIds).toEqual(["p1", "p2"]);
  });

  it("is deterministic under input shuffling", () => {
    const invs: InvoiceFacts[] = [
      invoice("i1", { amount: usd(30000) }),
      invoice("i2", { amount: usd(45000) }),
      invoice("i3", { amount: usd(25000) }),
      invoice("i4", { amount: usd(100000), client: "Globex LLC" }),
      invoice("i5", { amount: usd(100000), client: "Globex LLC" }),
      invoice("i6", { amount: usd(80000), client: "Initech" }),
    ];
    const pays: PaymentFacts[] = [
      payment("p1", { amount: usd(100000) }),
      payment("p2", { amount: usd(100000), payer: "Globex" }),
      payment("p3", { amount: usd(50000), payer: "Initech" }),
      payment("p4", { amount: usd(30000), payer: "Initech" }),
      payment("p5", { amount: usd(100000), payer: "Globex" }),
    ];
    const existing = [alloc("i6", "p9", usd(1), "rejected"), alloc("i5", "p2", usd(1), "rejected")];
    const base = proposeMatches(invs, pays, existing);
    expect(base.allocations.length).toBeGreaterThan(3);
    const rev = <T,>(a: T[]) => [...a].reverse();
    const rot = <T,>(a: T[]) => [...a.slice(2), ...a.slice(0, 2)];
    for (const shuffle of [rev, rot]) {
      expect(proposeMatches(shuffle(invs), shuffle(pays), shuffle(existing))).toEqual(base);
    }
  });
});
