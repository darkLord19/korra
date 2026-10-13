import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MonthStateWire, OnboardingWire, PackWire } from "@korra/backend/schemas";
import { currentMonthIST, shiftMonth } from "../lib/format";
import type { Task } from "../home/tasks";
import { Wrap, fakeApi, invoice, monthState, testNav } from "../test-utils";
import { HomeScreen } from "./HomeScreen";
import { MonthsScreen } from "./MonthsScreen";

const bank = { id: "bank1", name: "Acme Test Bank", adCode: "6390001" };
const TODAY = "2026-10-13";
const complete: OnboardingWire = { profile: { legalName: "Jane Dev Consulting", address: "1 Road", pan: "ABCDE1234F", gstin: null, iec: null, defaultSacCodes: [], defaultAdBankId: "bank1", signatoryName: null, signatoryDesignation: null, hasSignature: false, hasSeal: false } as never, banks: [bank], complete: true };
const incomplete: OnboardingWire = { profile: null, banks: [], complete: false };
const noBlockers = [{ adBankId: "bank1", adBankName: "Acme Test Bank", placeholderLayout: false, blockers: [] }];
const flaggedBlockers = [{ adBankId: "bank1", adBankName: "Acme Test Bank", placeholderLayout: false, blockers: [{ kind: "flagged_field" as const, entity: "invoice" as const, id: "inv1", field: "sacCode", confidence: 0.6 }] }];
const pack = (over: Partial<PackWire> = {}): PackWire => ({ id: "p1", month: "2026-09", adBankId: "bank1", layoutId: "l", status: "generated", files: [], generatedAt: "2026-10-01T00:00:00Z", submittedAt: null, ...over });

/** An api whose months come from `states` (an empty, blocker-free month otherwise). */
const homeApi = (onboarding: OnboardingWire, states: Record<string, MonthStateWire> = {}, packs: PackWire[] = [], over = {}) =>
  fakeApi({
    getOnboarding: vi.fn().mockResolvedValue(onboarding),
    getMonthState: vi.fn(async (m: string) => states[m] ?? monthState({ month: m })),
    listPacks: vi.fn().mockResolvedValue(packs),
    getTracker: vi.fn().mockRejectedValue(new Error("no tracker")),
    ...over,
  });

const home = (api: ReturnType<typeof fakeApi>, props: Partial<Parameters<typeof HomeScreen>[0]> = {}) =>
  render(<Wrap api={api}><HomeScreen taskId={null} today={TODAY} {...props} /></Wrap>);

describe("HomeScreen", () => {
  it("before setup, the hero is 'Set up and file your first EDF' and links to the setup flow", async () => {
    home(homeApi(incomplete));
    expect(await screen.findByRole("heading", { name: "Set up and file your first EDF" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Let's get you set up" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Let's go" }).getAttribute("href")).toBe("/home?task=setup");
  });

  it("greets the exporter by first name and counts what needs them", async () => {
    const sep = monthState({ month: "2026-09", invoices: [invoice()], blockersByBank: flaggedBlockers });
    home(homeApi(complete, { "2026-09": sep }));
    expect(await screen.findByText("Hey 👋 Jane")).toBeTruthy();
    expect(screen.getByRole("heading", { name: /need you|needs you/ })).toBeTruthy();
  });

  it("with a flagged invoice last month, the hero is a review task; the rest are rows with chips", async () => {
    const sep = monthState({ month: "2026-09", invoices: [invoice()], blockersByBank: flaggedBlockers });
    home(homeApi(complete, { "2026-09": sep }), { taskId: "review:2026-09" });
    const hero = (await screen.findAllByRole("heading", { name: "1 quick check on September" }))[0]!;
    const card = hero.parentElement!;
    expect(card.className).toContain("hero-gradient");
    expect(within(card).getByText(/EDF/)).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Let's go" }).getAttribute("href")).toBe("/home?task=review%3A2026-09");
    // October has nothing yet (day 13): an upload row follows, with a chip and the selected one marked
    const row = screen.getByRole("link", { name: /Add your October 2026 invoices/ });
    expect(row.getAttribute("href")).toBe("/home?task=upload%3A2026-10");
    expect(within(row).getByText(/Urgent|Due soon|FYI/)).toBeTruthy();
  });

  it("marks the selected row with aria-current", async () => {
    home(homeApi(complete), { taskId: "upload:2026-10" });
    const rows = await screen.findAllByRole("link", { name: /Add your/ });
    const current = rows.filter((r) => r.getAttribute("aria-current") === "true");
    expect(current.map((r) => r.getAttribute("href"))).toEqual(["/home?task=upload%3A2026-10"]);
  });

  it("renders the flow for ?task=: review:2026-09 opens ReviewFlow", async () => {
    const sep = monthState({ month: "2026-09", invoices: [invoice()], blockersByBank: flaggedBlockers });
    home(homeApi(complete, { "2026-09": sep }), { taskId: "review:2026-09" });
    expect(await screen.findByRole("button", { name: "Looks right" })).toBeTruthy();
  });

  it("opens a task that is not in the list yet (a pack made a moment ago, an upload link)", async () => {
    const api = homeApi(complete, {}, [], { getPackDownloads: vi.fn().mockRejectedValue(new Error("down")) });
    home(api, { taskId: "submit:newpack" });
    await waitFor(() => expect(api.getPackDownloads).toHaveBeenCalledWith("newpack"));
    expect(screen.queryByText("That's already done ✓")).toBeNull();
  });

  it("an unknown task id says it's already done, with a way home", async () => {
    const { unmount } = home(homeApi(complete), { taskId: "nope:1" });
    expect(await screen.findByRole("heading", { name: "That's already done ✓" })).toBeTruthy();
    unmount();
    home(homeApi(complete), { taskId: "setup" }); // a finished task id reads the same
    expect(await screen.findByRole("heading", { name: "That's already done ✓" })).toBeTruthy();
    expect(screen.getAllByRole("link", { name: "Back to Home" })[0]!.getAttribute("href")).toBe("/home");
  });

  it("with nothing to do: 'You're all caught up', the next EDF date and 'Add invoices'", async () => {
    const oct = monthState({ month: "2026-10", invoices: [invoice()], blockersByBank: noBlockers });
    const sep = monthState({ month: "2026-09", invoices: [invoice()], blockersByBank: noBlockers });
    const done = pack({ status: "submitted", submittedAt: "2026-10-05T00:00:00Z" });
    const octPack = pack({ id: "p2", month: "2026-10", status: "submitted", submittedAt: "2026-10-06T00:00:00Z" });
    home(homeApi(complete, { "2026-10": oct, "2026-09": sep }, [done, octPack]));
    expect(await screen.findByRole("heading", { name: "You're all caught up 🎉" })).toBeTruthy();
    expect(screen.getByText(/EDF due 30 Nov 2026/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add invoices" }).getAttribute("href")).toBe("/home?task=upload%3A2026-10");
    expect(screen.getByText("Recently done")).toBeTruthy();
  });

  it("onClose goes back to the list", async () => {
    const onSelectTask = vi.fn();
    const sep = monthState({ month: "2026-09", invoices: [invoice()], blockersByBank: flaggedBlockers });
    home(homeApi(complete, { "2026-09": sep }), { taskId: "review:2026-09", onSelectTask });
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(onSelectTask).toHaveBeenLastCalledWith(null);
  });

  it("a finished flow reloads, says what is next in a status toast, and selects it", async () => {
    const onSelectTask = vi.fn();
    const states: Record<string, MonthStateWire> = { "2026-09": monthState({ month: "2026-09", invoices: [invoice()], blockersByBank: flaggedBlockers }) };
    const editField = vi.fn(async () => {
      states["2026-09"] = monthState({ month: "2026-09", invoices: [invoice()], blockersByBank: noBlockers });
      return {} as never;
    });
    const api = homeApi(complete, states, [], { editField });
    home(api, { taskId: "review:2026-09", onSelectTask });
    await userEvent.click(await screen.findByRole("button", { name: "Looks right" }));
    await userEvent.click(await screen.findByRole("button", { name: "Make my pack" }));
    await waitFor(() => expect(onSelectTask).toHaveBeenCalledWith("generate:2026-09:bank1"));
    expect(within(screen.getByRole("status")).getByText("Nice! Next up: Your September pack is ready to make")).toBeTruthy();
  });

  it("with no next task given, picks the first one left (not the one just done) and then toasts", async () => {
    const onSelectTask = vi.fn();
    const backup: Task = { id: "backup", kind: "backup", title: "Back up your data", detail: "", urgency: "fyi", icon: "💾" };
    home(homeApi(complete), { taskId: "backup", extraTasks: [backup], onSelectTask, renderExtraTask: (_t, flow) => <button onClick={() => flow.onDone()}>Finish</button> });
    await userEvent.click(await screen.findByRole("button", { name: "Finish" }));
    await waitFor(() => expect(onSelectTask).toHaveBeenCalledWith("upload:2026-09")); // September is due soonest
    expect(within(screen.getByRole("status")).getByText(/Nice! Next up: Add your September 2026 invoices/)).toBeTruthy();
  });

  it("renders the app's own tasks through renderExtraTask", async () => {
    const backup: Task = { id: "backup", kind: "backup", title: "Back up your data", detail: "No backup yet", urgency: "fyi", icon: "💾" };
    home(homeApi(complete), { taskId: "backup", extraTasks: [backup], renderExtraTask: (t) => <p>Custom flow for {t.id}</p> });
    expect(await screen.findByText("Custom flow for backup")).toBeTruthy();
  });

  it("onSelectTask defaults to pushing the task's href", async () => {
    const push = vi.fn();
    render(<Wrap api={homeApi(complete)} nav={{ ...testNav, push }}><HomeScreen taskId="upload:2026-10" today={TODAY} /></Wrap>);
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(push).toHaveBeenCalledWith("/home");
  });

  it("polls while a document is being read", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const doc = { id: "d1", kind: null, month: "2026-10", filename: "a.pdf", mimeType: "application/pdf", status: "ingesting" as const, attempts: 0, error: null, createdAt: "2026-10-03T00:00:00Z", invoiceMonths: [] };
      const api = homeApi(complete, { "2026-10": monthState({ month: "2026-10", documents: [doc] }) });
      home(api);
      await screen.findByText("Hey 👋 Jane");
      const before = (api.getOnboarding as ReturnType<typeof vi.fn>).mock.calls.length;
      await vi.advanceTimersByTimeAsync(3100);
      expect((api.getOnboarding as ReturnType<typeof vi.fn>).mock.calls.length).toBeGreaterThan(before);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("MonthsScreen", () => {
  it("shows a card per month with data (plus this month) with a stage chip, and Payments due below", async () => {
    const cur = currentMonthIST();
    const prev = shiftMonth(cur, -1);
    const older = shiftMonth(cur, -2);
    const states: Record<string, MonthStateWire> = {
      [prev]: monthState({ month: prev, invoices: [invoice()], blockersByBank: flaggedBlockers }),
      [older]: monthState({ month: older, invoices: [invoice(), invoice({ id: "inv2" })], blockersByBank: noBlockers }),
    };
    const api = fakeApi({
      listPacks: vi.fn().mockResolvedValue([pack({ month: older, status: "submitted" })]),
      getMonthState: vi.fn(async (m: string) => states[m] ?? monthState({ month: m })),
      getTracker: vi.fn().mockResolvedValue({ asOf: TODAY, totals: { outstanding: [], due60: [], overdue: [] }, rows: [] }),
    });
    render(<Wrap api={api}><MonthsScreen /></Wrap>);
    const links = await screen.findAllByRole("link", { name: /20\d\d/ });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([cur, prev, older].map((m) => `/months/${m}`));
    expect(links[0]!.textContent).toContain("Nothing yet");
    expect(links[1]!.textContent).toContain("To check");
    expect(links[1]!.textContent).toContain("1 invoice");
    expect(links[2]!.textContent).toContain("Sent ✓");
    expect(links[2]!.textContent).toContain("2 invoices");
    expect(links[2]!.textContent).toContain("USD 3,000.00");
    expect(screen.getByRole("heading", { name: "Payments due" })).toBeTruthy();
    expect(api.getMonthState).toHaveBeenCalledTimes(12);
  });

  it("works without a tracker", async () => {
    const api = fakeApi({
      listPacks: vi.fn().mockResolvedValue([]),
      getMonthState: vi.fn(async (m: string) => monthState({ month: m })),
      getTracker: vi.fn().mockRejectedValue(new Error("nope")),
    });
    render(<Wrap api={api}><MonthsScreen /></Wrap>);
    expect(await screen.findAllByRole("link", { name: /20\d\d/ })).toHaveLength(1);
    expect(screen.queryByRole("heading", { name: "Payments due" })).toBeNull();
  });
});
