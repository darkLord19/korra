import { describe, expect, it } from "vitest";
import { dueNotifications, edfDueDate, REALISATION_THRESHOLDS, scheduleEvents } from "./index";
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

describe("scheduleEvents", () => {
  const inv = (id: string, deadline: string, status: "open" | "partially_realised" | "realised" | "overdue" = "open") => ({ id, invoiceNo: `N-${id}`, deadline, status });

  it("lists each month's EDF due date, and for open invoices the deadline plus the 60/30-day alerts", () => {
    const events = scheduleEvents({ months: ["2026-10", "2026-10", "2026-09"], invoices: [inv("a", "2027-07-15")] }, "2026-10-06");
    expect(events.map((e) => [e.date, e.uid, e.kind])).toEqual([
      ["2026-10-30", "edf_due:2026-09", "edf_due"],
      ["2026-11-30", "edf_due:2026-10", "edf_due"],
      ["2027-05-16", "realisation_due:a:d60", "realisation_alert"],
      ["2027-06-15", "realisation_due:a:d30", "realisation_alert"],
      ["2027-07-15", "realisation_deadline:a", "realisation_deadline"],
    ]);
    expect(events.find((e) => e.uid === "realisation_deadline:a")).toMatchObject({ endDate: "2027-07-16", invoiceNo: "N-a" });
  });

  it("alerts are the notification thresholds, not a second copy", () => {
    const alerts = scheduleEvents({ months: [], invoices: [inv("a", "2027-07-15")] }, "2026-10-06").filter((e) => e.kind === "realisation_alert");
    expect(alerts.map((e) => e.daysBefore)).toEqual([...REALISATION_THRESHOLDS]);
    for (const e of alerts) expect(dueNotifications(state({ months: [], invoices: [inv("a", "2027-07-15")] }), e.date).map((n) => n.dedupeKey)).toContain(e.uid);
  });

  it("skips realised invoices and alerts already in the past, keeps an overdue deadline", () => {
    const events = scheduleEvents({ months: [], invoices: [inv("done", "2027-07-15", "realised"), inv("late", "2026-09-01", "overdue"), inv("soon", "2026-11-20")] }, "2026-10-06");
    expect(events.map((e) => e.uid)).toEqual(["realisation_deadline:late", "realisation_due:soon:d30", "realisation_deadline:soon"]);
  });

  it("year and leap-day ends", () => {
    const [e] = scheduleEvents({ months: ["2027-12"], invoices: [] }, "2026-10-06");
    expect(e).toMatchObject({ date: "2028-01-30", endDate: "2028-01-31" });
    expect(scheduleEvents({ months: [], invoices: [inv("x", "2028-02-28")] }, "2028-02-01").find((x) => x.kind === "realisation_deadline")!.endDate).toBe("2028-02-29");
  });
});
