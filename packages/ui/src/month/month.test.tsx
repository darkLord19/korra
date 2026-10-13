import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PackWire } from "@korra/backend/schemas";
import { KorraApiError } from "../errors";
import { MonthScreen } from "../screens/MonthScreen";
import { Wrap, fakeApi, field, invoice, monthState } from "../test-utils";
import { MonthView } from "./MonthView";

const bank = { id: "bank1", name: "Acme Test Bank", adCode: "6390001" };
const noBlockers = [{ adBankId: "bank1", adBankName: "Acme Test Bank", placeholderLayout: false, blockers: [] }];
const pack = (over: Partial<PackWire> = {}): PackWire => ({
  id: "p1", month: "2026-09", adBankId: "bank1", layoutId: "l", status: "generated", files: [], generatedAt: "2026-10-01T00:00:00Z", submittedAt: null, ...over,
});
const view = (props: Partial<Parameters<typeof MonthView>[0]> = {}, api = fakeApi()) =>
  render(<Wrap api={api}><MonthView month="2026-09" state={monthState({ invoices: [invoice()] })} banks={[bank]} packs={[]} {...props} /></Wrap>);

describe("MonthView header", () => {
  it("shows the month, the stage, and links to the neighbouring months", () => {
    view({ state: monthState({ invoices: [invoice()], blockersByBank: noBlockers }) });
    expect(screen.getByRole("heading", { name: "September 2026" })).toBeTruthy();
    expect(screen.getByText("Ready to make")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Previous month, August 2026" }).getAttribute("href")).toBe("/months/2026-08");
    expect(screen.getByRole("link", { name: "Next month, October 2026" }).getAttribute("href")).toBe("/months/2026-10");
  });

  it("offers the next step: check, make, send, add", () => {
    const flagged = { kind: "flagged_field" as const, entity: "invoice" as const, id: "inv1", field: "sacCode", confidence: 0.6 };
    const { unmount } = view({ state: monthState({ invoices: [invoice()], blockersByBank: [{ ...noBlockers[0]!, blockers: [flagged, { ...flagged, field: "amount" }] }] }) });
    expect(screen.getByText("To check")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Check 2 things" }).getAttribute("href")).toBe("/home?task=review%3A2026-09");
    unmount();

    const ready = monthState({ invoices: [invoice()], blockersByBank: noBlockers });
    const second = view({ state: ready });
    expect(screen.getByRole("link", { name: "Make my pack" }).getAttribute("href")).toBe("/home?task=generate%3A2026-09%3Abank1");
    second.unmount();

    const third = view({ state: ready, packs: [pack()] });
    expect(screen.getAllByText("Not sent")).toHaveLength(2); // the header chip and the pack row
    expect(screen.getByRole("link", { name: "Send your pack" }).getAttribute("href")).toBe("/home?task=submit%3Ap1");
    third.unmount();

    view({ state: monthState() });
    expect(screen.getByRole("link", { name: "Add invoices" }).getAttribute("href")).toBe("/home?task=upload%3A2026-09");
  });

  it("has no next-step button once everything was sent, or when read-only", () => {
    const state = monthState({ invoices: [invoice()], blockersByBank: noBlockers });
    const { unmount } = view({ state, packs: [pack({ status: "submitted" })] });
    expect(screen.getAllByText("Sent ✓")).toHaveLength(2);
    expect(screen.queryByRole("link", { name: /Make my pack|Send your pack|Add invoices/ })).toBeNull();
    unmount();
    view({ state, readOnly: true });
    expect(screen.queryByRole("link", { name: "Make my pack" })).toBeNull();
  });
});

describe("MonthView invoices", () => {
  it("shows a card per invoice that opens a sheet with every field, flagged ones first", async () => {
    view();
    const card = screen.getByRole("button", { name: /Acme Corp/ });
    expect(card.textContent).toContain("INV-1");
    expect(within(card).getByText("1 to check")).toBeTruthy();
    await userEvent.click(card);
    const sheet = screen.getByRole("dialog", { name: "Invoice INV-1" });
    const labels = within(sheet).getAllByRole("term").map((t) => t.textContent);
    expect(labels).toHaveLength(11);
    expect(labels[0]).toBe("SAC code"); // the flagged field leads
    expect(within(sheet).getByRole("button", { name: "Edit Client name" })).toBeTruthy();
    expect(sheet.querySelector("#inv-inv1-sacCode")).toBeTruthy();
  });

  it("opens the sheet for the invoice the URL hash points at", () => {
    window.location.hash = "#inv-inv1";
    try {
      view();
      expect(screen.getByRole("dialog", { name: "Invoice INV-1" })).toBeTruthy();
    } finally {
      window.location.hash = "";
    }
  });

  it("\"I've checked these\" in the sheet calls confirmAllFields and reloads", async () => {
    const confirmAllFields = vi.fn().mockResolvedValue({ entity: "invoice", id: "inv1", changed: ["sacCode"] });
    const onChanged = vi.fn();
    view({ onChanged }, fakeApi({ confirmAllFields }));
    await userEvent.click(screen.getByRole("button", { name: /Acme Corp/ }));
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /I've checked these/ }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(confirmAllFields).toHaveBeenCalledWith({ entity: "invoice", id: "inv1" });
  });

  it("has no checking, editing or adding when read-only", async () => {
    view({ readOnly: true });
    expect(screen.queryByRole("button", { name: "Add documents" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Add an invoice by hand" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: /Acme Corp/ }));
    const sheet = screen.getByRole("dialog", { name: "Invoice INV-1" });
    expect(within(sheet).getByText("Software development")).toBeTruthy();
    expect(within(sheet).getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual(["Close"]); // nothing to edit
    expect(within(sheet).queryByRole("button", { name: /I've checked these/ })).toBeNull();
  });

  it("points an upload's invoices at the month they are dated in, and says so when there are none", () => {
    const doc = (invoiceMonths: string[]) => [{ id: "d1", kind: "invoice" as const, month: "2026-10", filename: "apr.pdf", mimeType: "application/pdf", status: "ingested" as const, attempts: 1, error: null, createdAt: "2026-10-03T00:00:00.000Z", invoiceMonths }];
    const { unmount } = render(<Wrap api={fakeApi()}><MonthView month="2026-10" state={monthState({ documents: doc(["2026-04", "2026-06"]) })} banks={[bank]} packs={[]} /></Wrap>);
    const docs = document.querySelector("#documents") as HTMLElement;
    expect(docs.textContent).toContain("Filed under April 2026, June 2026");
    const inv = document.querySelector("#invoices") as HTMLElement;
    expect(inv.textContent).toContain("No invoices dated in this month. Invoices from this month’s uploads are dated in April 2026, June 2026.");
    expect(within(inv).getByRole("link", { name: "April 2026" }).getAttribute("href")).toBe("/months/2026-04");
    unmount();

    render(<Wrap api={fakeApi()}><MonthView month="2026-10" state={monthState({ documents: doc(["2026-10"]) })} banks={[bank]} packs={[]} /></Wrap>);
    expect(screen.queryByText(/Filed under/)).toBeNull();
    expect(screen.getByText("No invoices for this month yet.")).toBeTruthy();
  });

  it("shows the realisation chip on a card", () => {
    const r = { deadline: "2027-06-02", status: "open" as const, realised: { minor: "0", currency: "USD" }, outstanding: { minor: "150000", currency: "USD" } };
    view({ state: monthState({ invoices: [invoice({ sacCode: field("998314") })], realisations: { inv1: r } }) });
    expect(screen.getByText("Payment due by 2 Jun 2027")).toBeTruthy();
  });
});

describe("MonthView actions", () => {
  it("adds documents from a sheet, with the hint select", async () => {
    view();
    await userEvent.click(screen.getByRole("button", { name: "Add documents" }));
    const sheet = screen.getByRole("dialog", { name: "Add documents" });
    expect(within(sheet).getByLabelText(/What is it\?/)).toBeTruthy();
    expect(within(sheet).getByText(/Add this month's invoices, your Deel transactions export/)).toBeTruthy();
  });

  it("shows the server's validation errors on the by-hand invoice form", async () => {
    const createInvoiceManually = vi.fn().mockRejectedValue(new KorraApiError({ kind: "validation", message: "invoiceDate: Expected YYYY-MM-DD; clientCountry: Expected a 2-letter country code like US" }));
    view({ state: monthState() }, fakeApi({ createInvoiceManually }));
    await userEvent.click(screen.getByRole("button", { name: "Add an invoice by hand" }));
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

  it("starts the by-hand SAC code with the last used one, still required, with common codes to pick from", async () => {
    const { unmount } = view({ state: monthState({ lastSacCode: "998313" }) });
    await userEvent.click(screen.getByRole("button", { name: "Add an invoice by hand" }));
    const form = screen.getByRole("form", { name: "Add invoice by hand" });
    const sac = within(form).getByLabelText("SAC code") as HTMLInputElement;
    expect(sac.value).toBe("998313");
    expect(sac.required).toBe(true);
    const options = Array.from(form.querySelectorAll(`datalist[id="${sac.getAttribute("list")}"] option`)).map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(["998311", "998313", "998314", "998391"]);
    unmount();

    view({ state: monthState() });
    await userEvent.click(screen.getByRole("button", { name: "Add an invoice by hand" }));
    expect((within(screen.getByRole("form", { name: "Add invoice by hand" })).getByLabelText("SAC code") as HTMLInputElement).value).toBe("");
  });
});

describe("MonthView documents, payments and packs", () => {
  it("offers 'Enter details by hand' on a failed document and attaches its id", async () => {
    const createPaymentManually = vi.fn().mockResolvedValue({ id: "pay1" });
    const onChanged = vi.fn();
    const documents = [{ id: "doc9", kind: null, month: "2026-09", filename: "scan.pdf", mimeType: "application/pdf", status: "failed" as const, attempts: 1, error: "Nothing readable", createdAt: "2026-09-03T00:00:00.000Z", invoiceMonths: [] }];
    view({ state: monthState({ documents }), onChanged }, fakeApi({ createPaymentManually }));
    expect(screen.getByText("Documents (1)")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /Enter details by hand/ }));
    await userEvent.click(screen.getByRole("button", { name: "A payment" }));
    const form = screen.getByRole("form", { name: "Add payment by hand" });
    fireEvent.change(within(form).getByLabelText("Date"), { target: { value: "2026-09-10" } });
    fireEvent.change(within(form).getByLabelText("Foreign amount"), { target: { value: "1500" } });
    await userEvent.click(within(form).getByRole("button", { name: "Save payment" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(createPaymentManually).toHaveBeenCalledWith({ documentId: "doc9", fields: { date: "2026-09-10", foreignAmount: { minor: "150000", currency: "USD" } } });
  });

  it("keeps payments and matches in a disclosure that is closed by default", () => {
    const { container } = view();
    const summary = screen.getByText("Payments & matches");
    const details = summary.closest("details") as HTMLDetailsElement;
    expect(details.open).toBe(false);
    expect(within(details).getByRole("heading", { name: "Payments" })).toBeTruthy();
    expect(within(details).getByRole("heading", { name: /Matches/ })).toBeTruthy();
    expect(container.querySelectorAll("details")).toHaveLength(2);
  });

  it("keeps the disclosure when read-only, with no add buttons in it", () => {
    view({ readOnly: true });
    const details = screen.getByText("Payments & matches").closest("details") as HTMLElement;
    expect(within(details).queryByRole("button", { name: "Add payment by hand" })).toBeNull();
  });

  it("lists the month's packs as links with their status", () => {
    view({ packs: [pack(), pack({ id: "p2", status: "submitted" })] });
    const links = within(document.querySelector("#packs") as HTMLElement).getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["/packs/p1", "/packs/p2"]);
    expect(links[0]!.textContent).toContain("Acme Test Bank");
    expect(links[0]!.textContent).toContain("Not sent");
    expect(links[1]!.textContent).toContain("Sent ✓");
  });
});

describe("MonthScreen", () => {
  it("loads through the api and reloads after a change", async () => {
    const getMonthState = vi.fn().mockResolvedValue(monthState({ invoices: [invoice()] }));
    const api = fakeApi({
      getMonthState,
      getOnboarding: vi.fn().mockResolvedValue({ profile: null, banks: [bank], complete: false }),
      listPacks: vi.fn().mockResolvedValue([]),
      confirmAllFields: vi.fn().mockResolvedValue({ entity: "invoice", id: "inv1", changed: [] }),
    });
    render(<Wrap api={api}><MonthScreen month="2026-09" /></Wrap>);
    await userEvent.click(await screen.findByRole("button", { name: /Acme Corp/ }));
    expect(getMonthState).toHaveBeenCalledTimes(1);
    await userEvent.click(within(screen.getByRole("dialog")).getByRole("button", { name: /I've checked these/ }));
    await waitFor(() => expect(getMonthState).toHaveBeenCalledTimes(2));
  });
});
