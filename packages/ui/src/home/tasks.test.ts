import { describe, expect, it } from "vitest";
import type { OnboardingWire, PackWire, TrackerWire, MonthStateWire, BlockerWire, TrackerRowWire } from "@korra/backend/schemas";
import { deriveTasks, findTask, taskFromId, type Task, type TaskInput } from "./tasks";
import { dateLabel } from "../lib/format";
import { field, invoice, monthState } from "../test-utils";

const TODAY = "2026-10-13";
const bank = { id: "bank1", name: "Acme Test Bank", adCode: "6390001" };

const addDays = (iso: string, n: number): string => new Date(Date.parse(iso) + n * 86_400_000).toISOString().slice(0, 10);

const onboarding = (over: Partial<OnboardingWire> = {}): OnboardingWire => ({ profile: null, banks: [bank], complete: true, ...over });

const bankBlockers = (blockers: BlockerWire[], adBankId = "bank1", adBankName = "Acme Test Bank") =>
  ({ adBankId, adBankName, placeholderLayout: false, blockers });

/** A month that is ready to generate (one invoice, no blockers). */
const readyMonth = (month: string, over: Partial<MonthStateWire> = {}) =>
  ({ month, state: monthState({ month, invoices: [invoice()], blockersByBank: [bankBlockers([])], ...over }) });

/** An empty month: no invoices, `no_invoices` blocker (what the backend reports). */
const emptyMonth = (month: string, over: Partial<MonthStateWire> = {}) =>
  ({ month, state: monthState({ month, blockersByBank: [bankBlockers([{ kind: "no_invoices" }])], ...over }) });

const pack = (over: Partial<PackWire> = {}): PackWire => ({
  id: "pack1", month: "2026-09", adBankId: "bank1", layoutId: "layout1", status: "generated",
  files: [], generatedAt: "2026-10-01T00:00:00Z", submittedAt: null, ...over,
});

const trackerRow = (id: string, status: "open" | "partially_realised" | "overdue" | "realised", deadline: string, invoiceNo = `INV-${id}`): TrackerRowWire => ({
  invoice: invoice({ id, invoiceNo: field(invoiceNo) }),
  realisation: {
    deadline, status,
    realised: { minor: "0", currency: "USD" },
    outstanding: { minor: "150000", currency: "USD" },
  },
});

const tracker = (...rows: TrackerRowWire[]): TrackerWire => ({
  asOf: TODAY, totals: { outstanding: [], due60: [], overdue: [] }, rows,
});

const input = (over: Partial<TaskInput> = {}): TaskInput => ({
  onboarding: onboarding(), months: [], packs: [], tracker: null, today: TODAY, ...over,
});

const all = (r: ReturnType<typeof deriveTasks>): Task[] => (r.hero ? [r.hero, ...r.rest] : r.rest);
const ids = (r: ReturnType<typeof deriveTasks>): string[] => all(r).map((t) => t.id);
const only = (r: ReturnType<typeof deriveTasks>, id: string): Task => {
  const t = all(r).find((x) => x.id === id);
  if (!t) throw new Error(`no task ${id} in ${ids(r).join(", ")}`);
  return t;
};

const extra = (over: Partial<Task> = {}): Task => ({
  id: "backup", kind: "backup", title: "Back up your data", detail: "Last backup 30 days ago", urgency: "fyi", icon: "💾", ...over,
});

describe("deriveTasks: setup", () => {
  it("returns only the setup task when onboarding is incomplete, ignoring everything else", () => {
    const r = deriveTasks(input({
      onboarding: onboarding({ complete: false }),
      months: [readyMonth("2026-09")],
      packs: [pack(), pack({ id: "p2", status: "submitted", submittedAt: "2026-10-02T00:00:00Z" })],
      tracker: tracker(trackerRow("a", "overdue", "2026-09-01")),
    }), [extra()]);
    expect(r).toEqual({
      hero: { id: "setup", kind: "setup", title: "Set up and file your first EDF", detail: "Drop one invoice and we'll fill in the rest.", urgency: "urgent", icon: "✨" },
      rest: [],
      done: [],
    });
  });
});

describe("deriveTasks: empty", () => {
  it("has no hero when there is nothing to do", () => {
    expect(deriveTasks(input())).toEqual({ hero: null, rest: [], done: [] });
  });

  it("has no hero when everything is filed and payments are far off", () => {
    const r = deriveTasks(input({
      months: [readyMonth("2026-09")],
      packs: [pack({ status: "submitted", submittedAt: "2026-10-01T00:00:00Z" })],
      tracker: tracker(trackerRow("a", "open", addDays(TODAY, 200))),
    }));
    expect(r.hero).toBeNull();
    expect(r.rest).toEqual([]);
    expect(r.done).toHaveLength(1);
  });
});

describe("deriveTasks: upload", () => {
  it("is created for a month with no invoices and no pack", () => {
    const r = deriveTasks(input({ months: [emptyMonth("2026-09")] }));
    expect(r.hero).toEqual({
      id: "upload:2026-09", kind: "upload", title: "Add your September 2026 invoices", detail: "EDF due 30 Oct 2026",
      due: "2026-10-30", urgency: "soon", icon: "📤", month: "2026-09",
    });
  });

  it("is skipped when a pack already exists for that month", () => {
    const r = deriveTasks(input({ months: [emptyMonth("2026-09")], packs: [pack({ status: "submitted", submittedAt: "2026-10-01T00:00:00Z" })] }));
    expect(ids(r)).toEqual([]);
  });

  it("is skipped when the month has an invoice", () => {
    const r = deriveTasks(input({ months: [readyMonth("2026-09")], packs: [pack({ status: "submitted", submittedAt: "2026-10-01T00:00:00Z" })] }));
    expect(ids(r).filter((i) => i.startsWith("upload"))).toEqual([]);
  });

  it("is skipped when an exporter detail is missing (profile task instead)", () => {
    const r = deriveTasks(input({
      months: [emptyMonth("2026-09", { blockersByBank: [bankBlockers([{ kind: "no_invoices" }, { kind: "missing_field", entity: "exporter", id: "e1", field: "pan" }])] })],
    }));
    expect(ids(r)).toEqual(["profile"]);
  });

  it("is skipped for the current month on day 5 but not on day 6", () => {
    expect(ids(deriveTasks(input({ today: "2026-10-05", months: [emptyMonth("2026-10")] })))).toEqual([]);
    expect(ids(deriveTasks(input({ today: "2026-10-01", months: [emptyMonth("2026-10")] })))).toEqual([]);
    expect(ids(deriveTasks(input({ today: "2026-10-06", months: [emptyMonth("2026-10")] })))).toEqual(["upload:2026-10"]);
  });

  it("still appears for the previous month in the first 5 days", () => {
    const r = deriveTasks(input({ today: "2026-10-03", months: [emptyMonth("2026-09"), emptyMonth("2026-10")] }));
    expect(ids(r)).toEqual(["upload:2026-09"]);
  });
});

describe("deriveTasks: review", () => {
  const flagged: BlockerWire = { kind: "flagged_field", entity: "invoice", id: "inv1", field: "sacCode", confidence: 0.6 };
  const missing: BlockerWire = { kind: "missing_field", entity: "invoice", id: "inv1", field: "clientName" };

  it("counts flagged and missing invoice fields, singular for one", () => {
    const r = deriveTasks(input({ months: [readyMonth("2026-09", { blockersByBank: [bankBlockers([flagged])] })] }));
    expect(only(r, "review:2026-09")).toEqual({
      id: "review:2026-09", kind: "review", title: "1 quick check on September", detail: "EDF due 30 Oct 2026",
      due: "2026-10-30", urgency: "soon", icon: "✏️", month: "2026-09",
    });
  });

  it("uses the plural for several", () => {
    const r = deriveTasks(input({ months: [readyMonth("2026-09", { blockersByBank: [bankBlockers([flagged, missing])] })] }));
    expect(only(r, "review:2026-09").title).toBe("2 quick checks on September");
  });

  it("does not count the same blocker twice when several banks report it", () => {
    const r = deriveTasks(input({
      onboarding: onboarding({ banks: [bank, { id: "bank2", name: "Other Bank", adCode: "1" }] }),
      months: [readyMonth("2026-09", { blockersByBank: [bankBlockers([flagged]), bankBlockers([flagged], "bank2", "Other Bank")] })],
    }));
    expect(only(r, "review:2026-09").title).toBe("1 quick check on September");
  });

  it("ignores document_pending and no_invoices blockers", () => {
    const r = deriveTasks(input({ months: [readyMonth("2026-09", { blockersByBank: [bankBlockers([{ kind: "document_pending", documentId: "d" }])] })] }));
    expect(ids(r)).toEqual([]);
  });

  it("does not make a generate task while a bank has blockers", () => {
    const r = deriveTasks(input({ months: [readyMonth("2026-09", { blockersByBank: [bankBlockers([flagged])] })] }));
    expect(ids(r)).toEqual(["review:2026-09"]);
  });
});

describe("deriveTasks: profile (exporter details missing)", () => {
  const exporterMissing: BlockerWire = { kind: "missing_field", entity: "exporter", id: "e1", field: "pan" };

  it("emits one urgent profile task linking to settings, even across months and banks", () => {
    const r = deriveTasks(input({
      months: [
        readyMonth("2026-09", { blockersByBank: [bankBlockers([exporterMissing]), bankBlockers([exporterMissing], "bank2", "B2")] }),
        readyMonth("2026-10", { blockersByBank: [bankBlockers([exporterMissing])] }),
      ],
    }));
    expect(ids(r)).toEqual(["profile"]);
    expect(r.hero).toMatchObject({ id: "profile", kind: "review", title: "Finish your details", urgency: "urgent", icon: "🪪", href: "settings" });
    expect(r.hero?.due).toBeUndefined();
  });

  it("does not create a review task for exporter fields", () => {
    const r = deriveTasks(input({ months: [readyMonth("2026-09", { blockersByBank: [bankBlockers([exporterMissing])] })] }));
    expect(ids(r)).toEqual(["profile"]);
  });
});

describe("deriveTasks: generate", () => {
  it("is created for a bank with no blockers, an invoice and no pack", () => {
    const r = deriveTasks(input({ months: [readyMonth("2026-09")] }));
    expect(r.hero).toEqual({
      id: "generate:2026-09:bank1", kind: "generate", title: "Your September pack is ready to make", detail: "EDF due 30 Oct 2026",
      due: "2026-10-30", urgency: "soon", icon: "📦", month: "2026-09", adBankId: "bank1",
    });
  });

  it("is per bank", () => {
    const r = deriveTasks(input({
      months: [readyMonth("2026-09", { blockersByBank: [bankBlockers([]), bankBlockers([], "bank2", "B2")] })],
    }));
    expect(ids(r)).toEqual(["generate:2026-09:bank1", "generate:2026-09:bank2"]);
  });

  it("is skipped for a bank that already has a pack for the month, but not for another bank", () => {
    const r = deriveTasks(input({
      months: [readyMonth("2026-09", { blockersByBank: [bankBlockers([]), bankBlockers([], "bank2", "B2")] })],
      packs: [pack({ status: "submitted", submittedAt: "2026-10-01T00:00:00Z" })],
    }));
    expect(ids(r)).toEqual(["generate:2026-09:bank2"]);
  });

  it("is skipped when the month has no invoices", () => {
    const r = deriveTasks(input({ months: [{ month: "2026-09", state: monthState({ blockersByBank: [bankBlockers([])] }) }] }));
    expect(ids(r).filter((i) => i.startsWith("generate"))).toEqual([]);
  });
});

describe("deriveTasks: submit", () => {
  it("is created for each generated pack, whatever its month, naming the bank", () => {
    const r = deriveTasks(input({
      months: [],
      packs: [pack({ id: "p1", month: "2026-08" }), pack({ id: "p2", month: "2026-09", status: "submitted", submittedAt: "2026-10-01T00:00:00Z" })],
    }));
    expect(ids(r)).toEqual(["submit:p1"]);
    expect(r.hero).toEqual({
      id: "submit:p1", kind: "submit", title: "Send your August 2026 pack to Acme Test Bank", detail: `EDF was due ${dateLabel("2026-09-30")}`,
      due: "2026-09-30", urgency: "urgent", icon: "📮", month: "2026-08", packId: "p1", adBankId: "bank1",
    });
  });

  it("falls back to 'your bank' when the bank is unknown", () => {
    const r = deriveTasks(input({ packs: [pack({ adBankId: "gone" })] }));
    expect(r.hero?.title).toBe("Send your September 2026 pack to your bank");
  });
});

describe("deriveTasks: realisation", () => {
  it("is created for an open row due within 60 days, with the days in the title", () => {
    const deadline = addDays(TODAY, 20);
    const r = deriveTasks(input({ tracker: tracker(trackerRow("a", "open", deadline, "INV-7")) }));
    expect(r.hero).toEqual({
      id: "realisation:a", kind: "realisation", title: "INV-7: payment due in 20 days", detail: "Due 2 Nov 2026",
      due: deadline, urgency: "soon", icon: "⏳", invoiceId: "a", month: "2026-09",
    });
  });

  it("says 'overdue' when past the deadline and is urgent", () => {
    const r = deriveTasks(input({ tracker: tracker(trackerRow("a", "overdue", addDays(TODAY, -3), "INV-9")) }));
    expect(r.hero).toMatchObject({ id: "realisation:a", title: "INV-9: payment overdue", urgency: "urgent", icon: "⏳" });
  });

  it("includes partially realised rows and skips realised ones", () => {
    const r = deriveTasks(input({ tracker: tracker(trackerRow("a", "partially_realised", addDays(TODAY, 10)), trackerRow("b", "realised", addDays(TODAY, 10))) }));
    expect(ids(r)).toEqual(["realisation:a"]);
  });

  it("uses singular 'day' for one day", () => {
    const r = deriveTasks(input({ tracker: tracker(trackerRow("a", "open", addDays(TODAY, 1), "INV-1")) }));
    expect(r.hero?.title).toBe("INV-1: payment due in 1 day");
  });

  it("treats a tracker of null as no rows", () => {
    expect(deriveTasks(input({ tracker: null })).hero).toBeNull();
  });
});

describe("deriveTasks: urgency boundaries", () => {
  // generate task for September: EDF due 2026-10-30
  const generateUrgency = (today: string) => only(deriveTasks(input({ today, months: [readyMonth("2026-09")] })), "generate:2026-09:bank1").urgency;

  it("EDF task: overdue is urgent", () => {
    expect(generateUrgency("2026-10-31")).toBe("urgent");
  });
  it("EDF task: due today is urgent", () => {
    expect(generateUrgency("2026-10-30")).toBe("urgent");
  });
  it("EDF task: exactly 7 days is urgent, 8 days is soon", () => {
    expect(generateUrgency("2026-10-23")).toBe("urgent");
    expect(generateUrgency("2026-10-22")).toBe("soon");
  });
  it("EDF task: exactly 30 days is soon, 31 days is fyi", () => {
    expect(generateUrgency("2026-09-30")).toBe("soon");
    expect(generateUrgency("2026-09-29")).toBe("fyi");
  });

  it("applies the same EDF thresholds to upload, review and submit", () => {
    const flagged: BlockerWire = { kind: "flagged_field", entity: "invoice", id: "inv1", field: "sacCode", confidence: 0.6 };
    for (const [today, urgency] of [["2026-10-23", "urgent"], ["2026-10-22", "soon"], ["2026-09-30", "soon"], ["2026-09-29", "fyi"]] as const) {
      expect(only(deriveTasks(input({ today, months: [emptyMonth("2026-09")] })), "upload:2026-09").urgency).toBe(urgency);
      expect(only(deriveTasks(input({ today, months: [readyMonth("2026-09", { blockersByBank: [bankBlockers([flagged])] })] })), "review:2026-09").urgency).toBe(urgency);
      expect(only(deriveTasks(input({ today, packs: [pack()] })), "submit:pack1").urgency).toBe(urgency);
    }
  });

  const realisationUrgency = (days: number) => {
    const r = deriveTasks(input({ tracker: tracker(trackerRow("a", "open", addDays(TODAY, days))) }));
    return all(r).find((t) => t.id === "realisation:a")?.urgency;
  };

  it("realisation: only overdue is urgent; 7 and 8 days out are soon", () => {
    expect(realisationUrgency(-1)).toBe("urgent");
    expect(realisationUrgency(7)).toBe("soon");
    expect(realisationUrgency(8)).toBe("soon");
  });
  it("realisation: 30 days is soon, 31 days is fyi", () => {
    expect(realisationUrgency(30)).toBe("soon");
    expect(realisationUrgency(31)).toBe("fyi");
  });
  it("realisation: 60 days is included, 61 days is not", () => {
    expect(realisationUrgency(60)).toBe("fyi");
    expect(realisationUrgency(61)).toBeUndefined();
  });
});

describe("deriveTasks: sorting", () => {
  it("sorts by urgency, then due date, then kind, then id", () => {
    const flagged: BlockerWire = { kind: "flagged_field", entity: "invoice", id: "inv1", field: "sacCode", confidence: 0.6 };
    const r = deriveTasks(input({
      months: [
        // Sep: EDF due 30 Oct (17 days: soon). Oct: EDF due 30 Nov (48 days: fyi).
        readyMonth("2026-09", { blockersByBank: [bankBlockers([flagged])] }),
        readyMonth("2026-10"),
      ],
      packs: [pack({ id: "pz", month: "2026-07" }), pack({ id: "pa", month: "2026-08" })], // due 30 Aug (overdue), 30 Sep (overdue)
      tracker: tracker(trackerRow("r", "open", "2026-10-30")), // same due as review:2026-09, soon
    }), [extra({ urgency: "fyi" })]);
    expect(ids(r)).toEqual([
      "submit:pz",          // urgent, due 2026-08-30
      "submit:pa",          // urgent, due 2026-09-30
      "review:2026-09",     // soon, due 2026-10-30, kind review before realisation
      "realisation:r",      // soon, due 2026-10-30
      "generate:2026-10:bank1", // fyi, due 2026-11-30
      "backup",             // fyi, no due: last
    ]);
    expect(r.hero?.id).toBe("submit:pz");
    expect(r.rest.map((t) => t.id)).toEqual(ids(r).slice(1));
  });

  it("puts urgent tasks without a due date (profile) after dated urgent ones", () => {
    const exporterMissing: BlockerWire = { kind: "missing_field", entity: "exporter", id: "e1", field: "pan" };
    const r = deriveTasks(input({
      months: [readyMonth("2026-09", { blockersByBank: [bankBlockers([exporterMissing])] })],
      packs: [pack({ id: "p", month: "2026-07" })],
    }));
    expect(ids(r)).toEqual(["submit:p", "profile"]);
  });

  it("orders kinds setup, review, generate, upload, submit, realisation, backup when due and urgency tie", () => {
    const due = "2026-10-30";
    const mk = (kind: Task["kind"], id: string): Task => extra({ id, kind, urgency: "soon", due });
    const r = deriveTasks(input(), [
      mk("backup", "k7"), mk("realisation", "k6"), mk("submit", "k5"), mk("upload", "k4"), mk("generate", "k3"), mk("review", "k2"), mk("setup", "k1"),
    ]);
    expect(ids(r)).toEqual(["k1", "k2", "k3", "k4", "k5", "k6", "k7"]);
  });

  it("breaks full ties by id", () => {
    const r = deriveTasks(input(), [extra({ id: "b" }), extra({ id: "a" })]);
    expect(ids(r)).toEqual(["a", "b"]);
  });
});

describe("deriveTasks: extras", () => {
  it("merges extra tasks before sorting, so an urgent extra becomes the hero", () => {
    const r = deriveTasks(input({ months: [readyMonth("2026-09")] }), [extra({ urgency: "urgent" })]);
    expect(r.hero?.id).toBe("backup");
    expect(r.rest.map((t) => t.id)).toEqual(["generate:2026-09:bank1"]);
  });

  it("an extra alone becomes the hero", () => {
    expect(deriveTasks(input(), [extra()]).hero?.id).toBe("backup");
  });
});

describe("deriveTasks: done", () => {
  const submitted = (id: string, month: string, at: string) => pack({ id, month, status: "submitted", submittedAt: at });

  it("lists submitted packs newest first, then realised rows", () => {
    const r = deriveTasks(input({
      packs: [submitted("p1", "2026-07", "2026-08-01T00:00:00Z"), submitted("p2", "2026-08", "2026-09-02T00:00:00Z"), pack({ id: "p3" })],
      tracker: tracker(trackerRow("a", "realised", "2026-12-01", "INV-A"), trackerRow("b", "open", "2027-12-01")),
    }));
    expect(r.done).toEqual([
      { id: "submitted:p2", title: "Sent August 2026 pack", icon: "✅" },
      { id: "submitted:p1", title: "Sent July 2026 pack", icon: "✅" },
      { id: "realised:a", title: "INV-A paid", icon: "💸" },
    ]);
  });

  it("caps at 5 in total, keeping submitted packs first", () => {
    const packs = [1, 2, 3, 4].map((n) => submitted(`p${n}`, "2026-0" + n, `2026-0${n + 4}-01T00:00:00Z`));
    const r = deriveTasks(input({ packs, tracker: tracker(trackerRow("a", "realised", "2026-12-01"), trackerRow("b", "realised", "2026-12-01")) }));
    expect(r.done.map((d) => d.id)).toEqual(["submitted:p4", "submitted:p3", "submitted:p2", "submitted:p1", "realised:a"]);
  });

  it("caps submitted packs alone at 5", () => {
    const packs = [1, 2, 3, 4, 5, 6, 7].map((n) => submitted(`p${n}`, "2026-01", `2026-02-0${n}T00:00:00Z`));
    expect(deriveTasks(input({ packs })).done).toHaveLength(5);
    expect(deriveTasks(input({ packs })).done[0]?.id).toBe("submitted:p7");
  });
});

describe("findTask", () => {
  const t1 = extra({ id: "one" });
  const t2 = extra({ id: "two" });

  it("finds the hero or a rest task by id", () => {
    expect(findTask({ hero: t1, rest: [t2] }, "one")).toBe(t1);
    expect(findTask({ hero: t1, rest: [t2] }, "two")).toBe(t2);
  });

  it("returns null for an unknown id or an empty list", () => {
    expect(findTask({ hero: t1, rest: [t2] }, "nope")).toBeNull();
    expect(findTask({ hero: null, rest: [] }, "one")).toBeNull();
  });
});

describe("realisation month and taskFromId", () => {
  it("gives a realisation task the month of its invoice date, and none when the invoice has no date", () => {
    const dated = deriveTasks(input({ tracker: tracker(trackerRow("a", "open", addDays(TODAY, 20))) }));
    expect(dated.hero?.month).toBe("2026-09");
    const row = trackerRow("b", "open", addDays(TODAY, 20));
    row.invoice = invoice({ id: "b", invoiceDate: field(null, 0, "default") });
    expect(deriveTasks(input({ tracker: tracker(row) })).hero?.month).toBeUndefined();
  });

  it("rebuilds the kinds that open a flow from their id", () => {
    expect(taskFromId("upload:2026-09")).toMatchObject({ kind: "upload", month: "2026-09" });
    expect(taskFromId("review:2026-09")).toMatchObject({ kind: "review", month: "2026-09" });
    expect(taskFromId("generate:2026-09:bank1")).toMatchObject({ kind: "generate", month: "2026-09", adBankId: "bank1" });
    expect(taskFromId("submit:pack-1")).toMatchObject({ kind: "submit", packId: "pack-1" });
  });

  it("returns null for anything else", () => {
    for (const id of ["setup", "backup", "realisation:a", "upload:soon", "review:2026-13", "generate:2026-09", "submit:", "nope"]) expect(taskFromId(id)).toBeNull();
  });
});
