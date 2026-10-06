import { describe, expect, it } from "vitest";
import { dueNotifications, edfDueDate } from "./index";
import type { ScheduleState } from "./index";

describe("edfDueDate", () => {
  it.each([
    ["2026-10", "2026-11-30"],
    ["2027-01", "2027-03-02"],
    ["2028-01", "2028-03-01"],
    ["2026-12", "2027-01-30"],
    ["2026-02", "2026-03-30"],
  ])("%s -> %s", (m, d) => expect(edfDueDate(m)).toBe(d));
});

const state = (over: Partial<ScheduleState[number]> = {}): ScheduleState => [
  {
    userId: "u1",
    email: "a@b.c",
    months: [{ month: "2026-10", hasDeclaredInvoices: true, submitted: false }],
    invoices: [],
    ...over,
  },
];

describe("dueNotifications: edf_due", () => {
  it("fires exactly 10 days before", () => {
    expect(dueNotifications(state(), "2026-11-20")).toEqual([
      {
        userId: "u1",
        kind: "edf_due",
        dedupeKey: "edf_due:2026-10:d10",
        vars: { month: "2026-10", dueDate: "2026-11-30" },
      },
    ]);
  });

  it("fires 3 days before; catch-up window of 2 extra days; nothing outside", () => {
    const keys = (d: string) => dueNotifications(state(), d).map((n) => n.dedupeKey);
    expect(keys("2026-11-27")).toEqual(["edf_due:2026-10:d3"]);
    expect(keys("2026-11-29")).toEqual(["edf_due:2026-10:d3"]);
    expect(keys("2026-11-22")).toEqual(["edf_due:2026-10:d10"]);
    expect(keys("2026-11-23")).toEqual([]);
    expect(keys("2026-11-19")).toEqual([]);
    expect(keys("2026-11-30")).toEqual([]);
    expect(keys("2026-12-01")).toEqual([]);
  });

  it("skips submitted months and months without declared invoices", () => {
    const s1 = state({ months: [{ month: "2026-10", hasDeclaredInvoices: true, submitted: true }] });
    const s2 = state({ months: [{ month: "2026-10", hasDeclaredInvoices: false, submitted: false }] });
    expect(dueNotifications(s1, "2026-11-20")).toEqual([]);
    expect(dueNotifications(s2, "2026-11-20")).toEqual([]);
  });
});

describe("dueNotifications: realisation_due", () => {
  const inv = (id: string, deadline: string, status: "open" | "realised" | "overdue" | "partially_realised") => ({
    id,
    invoiceNo: `N-${id}`,
    deadline,
    status,
  });

  it("fires 60 and 30 days before for non-realised invoices", () => {
    const s = state({
      months: [],
      invoices: [inv("a", "2027-01-31", "open"), inv("b", "2027-01-31", "realised")],
    });
    expect(dueNotifications(s, "2026-12-02")).toEqual([
      {
        userId: "u1",
        kind: "realisation_due",
        dedupeKey: "realisation_due:a:d60",
        vars: { invoiceNo: "N-a", deadline: "2027-01-31" },
      },
    ]);
    expect(dueNotifications(s, "2027-01-01").map((n) => n.dedupeKey)).toEqual(["realisation_due:a:d30"]);
    expect(dueNotifications(s, "2027-01-03").map((n) => n.dedupeKey)).toEqual(["realisation_due:a:d30"]);
    expect(dueNotifications(s, "2026-12-01")).toEqual([]);
    expect(dueNotifications(s, "2027-01-04")).toEqual([]);
  });

  it("partially realised still reminded; overdue past deadline not", () => {
    const s = state({ months: [], invoices: [inv("a", "2027-01-31", "partially_realised")] });
    expect(dueNotifications(s, "2026-12-02")).toHaveLength(1);
    const o = state({ months: [], invoices: [inv("a", "2026-12-01", "overdue")] });
    expect(dueNotifications(o, "2026-12-02")).toEqual([]);
  });
});
