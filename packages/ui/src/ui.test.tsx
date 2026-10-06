import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KorraApiError } from "./errors";
import { MonthScreen } from "./screens/MonthScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { MonthView } from "./month/MonthView";
import { Wrap, fakeApi, invoice, monthState, testNav } from "./test-utils";

const bank = { id: "bank1", name: "Acme Test Bank", adCode: "6390001" };

describe("month view", () => {
  it("lists what blocks a pack and links to it, and hides the generate button", () => {
    const state = monthState({
      invoices: [invoice()],
      blockersByBank: [{
        adBankId: "bank1", adBankName: "Acme Test Bank", placeholderLayout: false,
        blockers: [
          { kind: "flagged_field", entity: "invoice", id: "inv1", field: "sacCode", confidence: 0.6 },
          { kind: "missing_field", entity: "exporter", id: "x", field: "pan" },
        ],
      }],
    });
    render(<Wrap api={fakeApi()}><MonthView month="2026-09" state={state} banks={[bank]} packs={[]} /></Wrap>);
    expect(screen.getByText("Fix these before you can generate the pack:")).toBeTruthy();
    expect(screen.getByText(/Check SAC code on invoice INV-1: Korra was only 60% sure/)).toBeTruthy();
    expect(screen.getByText(/Your profile is missing PAN/)).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "Go to it" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["#inv-inv1-sacCode", "/onboarding"]);
    expect(screen.queryByRole("button", { name: "Generate EDF pack" })).toBeNull();
  });

  it("shows the generate button when nothing blocks, and goes to the pack", async () => {
    const generatePack = vi.fn().mockResolvedValue({ ok: true, packId: "p1", layoutId: "generic", placeholder: false });
    const push = vi.fn();
    const state = monthState({ blockersByBank: [{ adBankId: "bank1", adBankName: "Acme Test Bank", placeholderLayout: false, blockers: [] }] });
    render(<Wrap api={fakeApi({ generatePack })} nav={{ ...testNav, push }}><MonthView month="2026-09" state={state} banks={[bank]} packs={[]} /></Wrap>);
    await userEvent.click(screen.getByRole("button", { name: "Generate EDF pack" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/packs/p1"));
    expect(generatePack).toHaveBeenCalledWith({ month: "2026-09", adBankId: "bank1" });
  });

  it("\"I've checked these\" calls confirmAllFields and reloads", async () => {
    const confirmAllFields = vi.fn().mockResolvedValue({ entity: "invoice", id: "inv1", changed: ["sacCode"] });
    const onChanged = vi.fn();
    render(<Wrap api={fakeApi({ confirmAllFields })}><MonthView month="2026-09" state={monthState({ invoices: [invoice()] })} banks={[bank]} packs={[]} onChanged={onChanged} /></Wrap>);
    const article = screen.getByRole("article", { name: "Invoice INV-1" });
    expect(within(article).getByText("Check this")).toBeTruthy();
    await userEvent.click(within(article).getByRole("button", { name: /I've checked these/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(confirmAllFields).toHaveBeenCalledWith({ entity: "invoice", id: "inv1" });
  });

  it("has no checking, editing or hand entry when read-only", () => {
    render(<Wrap api={fakeApi()}><MonthView month="2026-09" state={monthState({ invoices: [invoice()] })} banks={[bank]} packs={[]} readOnly /></Wrap>);
    expect(screen.queryByRole("button", { name: /I've checked these/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add invoice by hand" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Edit SAC code" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Upload" })).toBeNull();
  });

  it("shows the server's validation errors on the by-hand invoice form", async () => {
    const createInvoiceManually = vi.fn().mockRejectedValue(new KorraApiError({ kind: "validation", message: "invoiceDate: Expected YYYY-MM-DD; clientCountry: Expected a 2-letter country code like US" }));
    render(<Wrap api={fakeApi({ createInvoiceManually })}><MonthView month="2026-09" state={monthState()} banks={[bank]} packs={[]} /></Wrap>);
    await userEvent.click(screen.getByRole("button", { name: "Add invoice by hand" }));
    const form = screen.getByRole("form", { name: "Add invoice by hand" });
    const type = (label: string, value: string) => fireEvent.change(within(form).getByLabelText(label), { target: { value } });
    type("Invoice number", "INV-9");
    type("Invoice date", "2026-09-05");
    type("Client name", "Acme");
    type("Client country", "USA");
    type("Client address", "1 Main St");
    type("Invoice amount", "100.50");
    type("Service description", "Dev");
    type("SAC code", "998314");
    await userEvent.click(within(form).getByRole("button", { name: "Save invoice" }));
    expect(await within(form).findByText("Expected YYYY-MM-DD")).toBeTruthy();
    expect(within(form).getByText("Expected a 2-letter country code like US")).toBeTruthy();
    expect(createInvoiceManually).toHaveBeenCalledWith({
      month: "2026-09",
      fields: expect.objectContaining({ invoiceNo: "INV-9", amount: { minor: "10050", currency: "USD" }, netRealisableValue: { minor: "10050", currency: "USD" } }),
    });
  });

  it("offers 'Enter details by hand' on a failed document and attaches its id", async () => {
    const createPaymentManually = vi.fn().mockResolvedValue({ id: "pay1" });
    const onChanged = vi.fn();
    const documents = [{ id: "doc9", kind: null, month: "2026-09", filename: "scan.pdf", mimeType: "application/pdf", status: "failed" as const, attempts: 1, error: "Nothing readable", createdAt: "2026-09-03T00:00:00.000Z" }];
    render(<Wrap api={fakeApi({ createPaymentManually })}><MonthView month="2026-09" state={monthState({ documents })} banks={[bank]} packs={[]} onChanged={onChanged} /></Wrap>);
    await userEvent.click(screen.getByRole("button", { name: /Enter details by hand/ }));
    await userEvent.click(screen.getByRole("button", { name: "A payment" }));
    const form = screen.getByRole("form", { name: "Add payment by hand" });
    fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-09-10" } });
    fireEvent.change(within(form).getByLabelText("Foreign amount"), { target: { value: "1500" } });
    await userEvent.click(within(form).getByRole("button", { name: "Save payment" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(createPaymentManually).toHaveBeenCalledWith({ documentId: "doc9", fields: { date: "2026-09-10", foreignAmount: { minor: "150000", currency: "USD" } } });
  });
});

describe("month screen", () => {
  it("loads through the api and reloads after a change", async () => {
    const getMonthState = vi.fn().mockResolvedValue(monthState({ invoices: [invoice()] }));
    const api = fakeApi({
      getMonthState,
      getOnboarding: vi.fn().mockResolvedValue({ profile: null, banks: [bank], complete: false }),
      listPacks: vi.fn().mockResolvedValue([]),
      confirmAllFields: vi.fn().mockResolvedValue({ entity: "invoice", id: "inv1", changed: [] }),
    });
    render(<Wrap api={api}><MonthScreen month="2026-09" /></Wrap>);
    expect(await screen.findByRole("article", { name: "Invoice INV-1" })).toBeTruthy();
    expect(getMonthState).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: /I've checked these/ }));
    await waitFor(() => expect(getMonthState).toHaveBeenCalledTimes(2));
  });
});

describe("capabilities", () => {
  const onboarding = { profile: null, banks: [bank], complete: false };
  const slots = { caSharing: <p>CA panel</p>, backup: <p>Backup panel</p>, data: <p>Data panel</p> };

  it("hides the panels an adapter lacks", async () => {
    render(<Wrap api={fakeApi({ getOnboarding: vi.fn().mockResolvedValue(onboarding) }, { caSharing: false, backup: false, accountDeletion: "local" })}><SettingsScreen slots={slots} /></Wrap>);
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeTruthy();
    expect(screen.queryByText("CA panel")).toBeNull();
    expect(screen.queryByText("Backup panel")).toBeNull();
    expect(screen.getByText("Data panel")).toBeTruthy();
  });

  it("shows them when the adapter has them", async () => {
    render(<Wrap api={fakeApi({ getOnboarding: vi.fn().mockResolvedValue(onboarding) }, { caSharing: true, backup: true })}><SettingsScreen slots={slots} /></Wrap>);
    expect(await screen.findByText("CA panel")).toBeTruthy();
    expect(screen.getByText("Backup panel")).toBeTruthy();
  });
});
