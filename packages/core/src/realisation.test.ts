import { describe, expect, it } from "vitest";
import { money, realisationOf } from "./index";
import { alloc, f, invoice } from "./fixtures.test-util";

const usd = (n: number) => money(n, "USD");

describe("realisationOf", () => {
  it.each([
    ["2026-01-31", "USD", "2026-10-31"],
    ["2027-05-31", "USD", "2028-02-29"],
    ["2026-05-31", "USD", "2027-02-28"],
    ["2026-10-05", "USD", "2027-07-05"],
    ["2026-10-05", "INR", "2027-10-05"],
    ["2027-02-28", "INR", "2028-02-28"],
    ["2027-02-28", "USD", "2027-11-28"],
    ["2028-02-29", "INR", "2029-02-28"],
  ])("deadline for %s (%s) is %s", (date, ccy, expected) => {
    const inv = invoice("i1", { date, amount: money(1000, ccy) });
    expect(realisationOf(inv, [], "2026-10-06").deadline).toBe(expected);
  });

  it("open with no allocations", () => {
    const r = realisationOf(invoice("i1"), [], "2026-10-06");
    expect(r.status).toBe("open");
    expect(r.realised).toEqual(usd(0));
    expect(r.outstanding).toEqual(usd(100000));
  });

  it("only confirmed allocations count", () => {
    const allocs = [
      alloc("i1", "p1", usd(40000), "confirmed"),
      alloc("i1", "p2", usd(30000), "proposed"),
      alloc("i1", "p3", usd(30000), "rejected"),
      alloc("other", "p4", usd(100000), "confirmed"),
    ];
    const r = realisationOf(invoice("i1"), allocs, "2026-10-06");
    expect(r.realised).toEqual(usd(40000));
    expect(r.outstanding).toEqual(usd(60000));
    expect(r.status).toBe("partially_realised");
  });

  it("realised when outstanding within 3%", () => {
    const r = realisationOf(invoice("i1"), [alloc("i1", "p1", usd(97000), "confirmed")], "2026-10-06");
    expect(r.status).toBe("realised");
    const r2 = realisationOf(invoice("i1"), [alloc("i1", "p1", usd(96999), "confirmed")], "2026-10-06");
    expect(r2.status).toBe("partially_realised");
  });

  it("over-realised clamps outstanding to zero", () => {
    const r = realisationOf(invoice("i1"), [alloc("i1", "p1", usd(100500), "confirmed")], "2026-10-06");
    expect(r.status).toBe("realised");
    expect(r.outstanding).toEqual(usd(0));
  });

  it("overdue only strictly after the deadline; wins over partial", () => {
    const inv = invoice("i1", { date: "2026-01-31" });
    expect(realisationOf(inv, [], "2026-10-31").status).toBe("open");
    expect(realisationOf(inv, [], "2026-11-01").status).toBe("overdue");
    const partial = [alloc("i1", "p1", usd(50000), "confirmed")];
    expect(realisationOf(inv, partial, "2026-11-01").status).toBe("overdue");
  });

  it("realised invoice is never overdue", () => {
    const inv = invoice("i1", { date: "2026-01-31" });
    const r = realisationOf(inv, [alloc("i1", "p1", usd(100000), "confirmed")], "2027-06-01");
    expect(r.status).toBe("realised");
  });

  it("throws a clear error when invoiceDate or amount is missing", () => {
    expect(() => realisationOf(invoice("i1", { date: null }), [], "2026-10-06")).toThrow(/i1.*invoiceDate/);
    expect(() => realisationOf(invoice("i1", { amount: null }), [], "2026-10-06")).toThrow(/i1.*amount/);
    const inv = { ...invoice("i2"), amount: f<ReturnType<typeof usd>>(null) };
    expect(() => realisationOf(inv, [], "2026-10-06")).toThrow();
  });
});
