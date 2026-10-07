import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { KorraApiError } from "./errors";
import { ProfileForm } from "./forms/ProfileForm";
import { MonthScreen } from "./screens/MonthScreen";
import { OnboardingScreen } from "./screens/OnboardingScreen";
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

  it("starts the by-hand SAC code with the last used one, still required, with common codes to pick from", async () => {
    const { unmount } = render(<Wrap api={fakeApi()}><MonthView month="2026-09" state={monthState({ lastSacCode: "998313" })} banks={[bank]} packs={[]} /></Wrap>);
    await userEvent.click(screen.getByRole("button", { name: "Add invoice by hand" }));
    const form = screen.getByRole("form", { name: "Add invoice by hand" });
    const sac = within(form).getByLabelText("SAC code") as HTMLInputElement;
    expect(sac.value).toBe("998313");
    expect(sac.required).toBe(true);
    expect(within(form).getByText("6 digits, e.g. 998314 for software development")).toBeTruthy();
    const options = Array.from(form.querySelectorAll(`datalist[id="${sac.getAttribute("list")}"] option`)).map((o) => (o as HTMLOptionElement).value);
    expect(options).toEqual(["998311", "998313", "998314", "998391"]);
    unmount();

    render(<Wrap api={fakeApi()}><MonthView month="2026-09" state={monthState()} banks={[bank]} packs={[]} /></Wrap>);
    await userEvent.click(screen.getByRole("button", { name: "Add invoice by hand" }));
    expect((within(screen.getByRole("form", { name: "Add invoice by hand" })).getByLabelText("SAC code") as HTMLInputElement).value).toBe("");
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

  it("mode=\"edf\" hides Payments, Matches and prev/next, and shows Upload, Documents, Invoices and Packs", () => {
    const state = monthState({ invoices: [invoice()] });
    render(<Wrap api={fakeApi()}><MonthView month="2026-09" state={state} banks={[bank]} packs={[]} mode="edf" /></Wrap>);

    expect(screen.getByRole("heading", { name: "Step 2 of 3 · Your September 2026 invoices" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Previous month/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /Next month/ })).toBeNull();
    expect(screen.getByLabelText("Change month")).toBeTruthy();

    expect(screen.getByRole("heading", { name: "Upload" })).toBeTruthy();
    expect(screen.getByText("Add this month's invoices (PDF, or a Deel export CSV).")).toBeTruthy();
    expect(screen.queryByLabelText(/What is it\?/)).toBeNull();

    expect(screen.getByRole("heading", { name: "Documents" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Invoices" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Step 3 · Download your EDF pack" })).toBeTruthy();

    expect(screen.queryByRole("heading", { name: "Payments" })).toBeNull();
    expect(screen.queryByRole("heading", { name: /Matches/ })).toBeNull();
  });

  it("default mode is unchanged (full mode with Payments, Matches, and prev/next)", () => {
    const state = monthState({ invoices: [invoice()] });
    render(<Wrap api={fakeApi()}><MonthView month="2026-09" state={state} banks={[bank]} packs={[]} /></Wrap>);

    expect(screen.getByRole("heading", { name: "September 2026" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Previous month/ })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Next month/ })).toBeTruthy();
    expect(screen.queryByLabelText("Change month")).toBeNull();

    expect(screen.getByText(/Add this month's invoices, your Deel transactions export/)).toBeTruthy();
    expect(screen.getByLabelText(/What is it\?/)).toBeTruthy();

    expect(screen.getByRole("heading", { name: "Payments" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /Matches/ })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "EDF packs" })).toBeTruthy();
  });

  it("all blocker link targets in PacksSection are visible in EDF mode", () => {
    const documents = [{ id: "doc1", kind: null, month: "2026-09", filename: "inv.pdf", mimeType: "application/pdf", status: "ingesting" as const, attempts: 1, error: null, createdAt: "2026-09-01T00:00:00.000Z" }];
    const state = monthState({
      documents,
      invoices: [invoice({ id: "inv1", invoiceNo: { source: "extracted", confidence: 1, value: "INV-1" }, amount: { source: "extracted", confidence: 0.6, value: { minor: "1000", currency: "USD" } } })],
      blockersByBank: [
        {
          adBankId: "bank1",
          adBankName: "Acme Test Bank",
          placeholderLayout: false,
          blockers: [
            { kind: "no_invoices" },
            { kind: "document_pending", documentId: "doc1" },
            { kind: "missing_field", entity: "exporter", id: "exp", field: "pan" },
            { kind: "missing_field", entity: "invoice", id: "inv1", field: "clientAddress" },
            { kind: "flagged_field", entity: "invoice", id: "inv1", field: "amount", confidence: 0.6 },
          ],
        },
      ],
    });
    const { container } = render(<Wrap api={fakeApi()}><MonthView month="2026-09" state={state} banks={[bank]} packs={[]} mode="edf" /></Wrap>);

    const links = screen.getAllByRole("link", { name: "Go to it" });
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "#upload",
      "#documents",
      "/onboarding",
      "#inv-inv1-clientAddress",
      "#inv-inv1-amount",
    ]);

    expect(container.querySelector("#upload")).toBeTruthy();
    expect(container.querySelector("#documents")).toBeTruthy();
    expect(container.querySelector("#inv-inv1-clientAddress")).toBeTruthy();
    expect(container.querySelector("#inv-inv1-amount")).toBeTruthy();
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

describe("profile form: PAN from GSTIN", () => {
  const pan = () => screen.getByLabelText("PAN", { exact: true }) as HTMLInputElement;
  const gstin = () => screen.getByLabelText("GSTIN") as HTMLInputElement;
  const mismatch = /Doesn't match the PAN inside your GSTIN \(ABCDE1234F\)\./;
  const form = (profile: Parameters<typeof ProfileForm>[0]["profile"] = null, api = fakeApi()) => render(<Wrap api={api}><ProfileForm profile={profile} banks={[]} /></Wrap>);

  it("asks for the GSTIN before the PAN", () => {
    form();
    expect(gstin().compareDocumentPosition(pan()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("fills an empty PAN once the GSTIN is complete (any case), and leaves it editable", async () => {
    form();
    await userEvent.type(gstin(), "29abcde1234f1z");
    expect(pan().value).toBe(""); // not a full GSTIN yet
    await userEvent.type(gstin(), "5");
    expect(pan().value).toBe("ABCDE1234F");
    await userEvent.clear(pan());
    await userEvent.type(pan(), "ZZZZZ9999Z");
    expect(pan().value).toBe("ZZZZZ9999Z");
  });

  it("never overwrites a PAN that is already there", async () => {
    form();
    await userEvent.type(pan(), "ZZZZZ9999Z");
    await userEvent.type(gstin(), "29ABCDE1234F1Z5");
    expect(pan().value).toBe("ZZZZZ9999Z");
  });

  it("warns softly when the PAN differs from the one inside the GSTIN, and still saves", async () => {
    const saveBank = vi.fn().mockResolvedValue({ id: "b1", name: "HDFC Bank", adCode: "" });
    const saveProfile = vi.fn().mockResolvedValue({});
    form(null, fakeApi({ saveBank, saveProfile }));
    await userEvent.type(screen.getByLabelText("Legal name"), "Jane Dev");
    await userEvent.type(screen.getByLabelText("Registered address"), "12 MG Road");
    await userEvent.type(pan(), "ZZZZZ9999Z");
    await userEvent.type(gstin(), "29ABCDE1234F1Z5");
    const warning = screen.getByText(mismatch);
    expect(warning.getAttribute("role")).toBeNull(); // advice, not an error
    expect(pan().getAttribute("aria-invalid")).not.toBe("true");
    await userEvent.selectOptions(screen.getByLabelText("Which bank receives your foreign payments?"), "HDFC Bank");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ pan: "ZZZZZ9999Z", gstin: "29ABCDE1234F1Z5" })));
    await userEvent.clear(pan());
    await userEvent.type(pan(), "abcde1234f");
    expect(screen.queryByText(mismatch)).toBeNull();
  });

  it("says nothing while the PAN is still being typed, or when there is no full GSTIN", async () => {
    form();
    await userEvent.type(gstin(), "29ABCDE1234F1Z5");
    await userEvent.clear(pan());
    await userEvent.type(pan(), "ZZZZ");
    expect(screen.queryByText(/Doesn't match/)).toBeNull();
    await userEvent.clear(gstin());
    await userEvent.type(gstin(), "29ABCDE1234F");
    await userEvent.type(pan(), "Z9999Z");
    expect(screen.queryByText(/Doesn't match/)).toBeNull();
  });
});

describe("profile form: choosing a bank", () => {
  const profile = { legalName: "Jane Dev", address: "12 MG Road", pan: "ABCDE1234F", gstin: "29ABCDE1234F1Z5", iec: null, defaultSacCodes: ["998314"], defaultAdBankId: "bank1" };
  const bankSelect = () => screen.getByLabelText("Which bank receives your foreign payments?") as HTMLSelectElement;
  const adInput = () => screen.getByLabelText(/^AD code/) as HTMLInputElement;
  const fillProfile = async () => {
    await userEvent.type(screen.getByLabelText("Legal name"), "Jane Dev");
    await userEvent.type(screen.getByLabelText("Registered address"), "12 MG Road");
    await userEvent.type(screen.getByLabelText("PAN"), "ABCDE1234F");
    await userEvent.type(screen.getByLabelText("GSTIN"), "29ABCDE1234F1Z5");
  };
  const apis = () => {
    const saveBank = vi.fn().mockImplementation(async (i: { id?: string; name: string; adCode: string }) => ({ id: i.id ?? "new1", name: i.name, adCode: i.adCode }));
    const saveProfile = vi.fn().mockResolvedValue({});
    return { saveBank, saveProfile, api: fakeApi({ saveBank, saveProfile }) };
  };

  it("offers the catalog plus Other bank, with no 'Add bank' step", () => {
    render(<Wrap api={fakeApi()}><ProfileForm profile={null} banks={[]} /></Wrap>);
    const options = Array.from(bankSelect().options).map((o) => o.text);
    expect(options).toEqual(expect.arrayContaining(["HDFC Bank", "ICICI Bank", "Axis Bank", "Punjab National Bank", "Other bank"]));
    expect(screen.queryByRole("button", { name: "Add bank" })).toBeNull();
    expect(screen.queryByLabelText("Bank name")).toBeNull();
  });

  it("creates the bank for a catalog choice (AD code optional), then saves the profile with its id", async () => {
    const { api, saveBank, saveProfile } = apis();
    render(<Wrap api={api}><ProfileForm profile={null} banks={[]} /></Wrap>);
    expect(adInput().hasAttribute("required")).toBe(false);
    expect(screen.getByText(/Leave blank if you don't have it; your bank can fill it in\./)).toBeTruthy();
    await fillProfile();
    await userEvent.selectOptions(bankSelect(), "HDFC Bank");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveBank).toHaveBeenCalledWith({ name: "HDFC Bank", adCode: "" });
    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ legalName: "Jane Dev", defaultAdBankId: "new1" }));
  });

  it("'Other bank' reveals a free-text name that becomes the bank's name", async () => {
    const { api, saveBank, saveProfile } = apis();
    render(<Wrap api={api}><ProfileForm profile={null} banks={[]} /></Wrap>);
    await fillProfile();
    await userEvent.selectOptions(bankSelect(), "Other bank");
    await userEvent.type(screen.getByLabelText("Bank name"), "  Federal Bank ");
    await userEvent.type(adInput(), "1234567");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveBank).toHaveBeenCalledWith({ name: "Federal Bank", adCode: "1234567" });
    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ defaultAdBankId: "new1" }));
  });

  it("reuses an existing bank row with the same name (any case), updating its AD code", async () => {
    const { api, saveBank, saveProfile } = apis();
    render(<Wrap api={api}><ProfileForm profile={null} banks={[{ id: "old9", name: "hdfc bank", adCode: "" }]} /></Wrap>);
    await fillProfile();
    await userEvent.selectOptions(bankSelect(), "HDFC Bank");
    await userEvent.type(adInput(), "6390009");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveBank).toHaveBeenCalledWith({ id: "old9", name: "HDFC Bank", adCode: "6390009" });
    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ defaultAdBankId: "old9" }));
  });

  it("hints at ICICI's code only while ICICI is chosen and the code is empty, and never fills it in", async () => {
    render(<Wrap api={fakeApi()}><ProfileForm profile={null} banks={[]} /></Wrap>);
    const hint = /ICICI Bank's own EDF form uses 6390002/;
    expect(screen.queryByText(hint)).toBeNull();
    await userEvent.selectOptions(bankSelect(), "HDFC Bank");
    expect(screen.queryByText(hint)).toBeNull();
    await userEvent.selectOptions(bankSelect(), "ICICI Bank");
    expect(screen.getByText(hint)).toBeTruthy();
    expect(adInput().value).toBe("");
    await userEvent.type(adInput(), "1234567");
    expect(screen.queryByText(hint)).toBeNull();
  });

  it("when editing a bank outside the catalog, selects 'Other bank' with its name and AD code", () => {
    render(<Wrap api={fakeApi()}><ProfileForm profile={profile} banks={[bank, { id: "x", name: "HDFC Bank", adCode: "" }]} /></Wrap>);
    expect(bankSelect().value).toBe("other"); // "Acme Test Bank" is not in the catalog
    expect((screen.getByLabelText("Bank name") as HTMLInputElement).value).toBe("Acme Test Bank");
    expect(adInput().value).toBe("6390001");
  });

  it("when editing a catalog bank, selects it and updates its row instead of creating one", async () => {
    const { api, saveBank, saveProfile } = apis();
    render(<Wrap api={api}><ProfileForm profile={{ ...profile, defaultAdBankId: "b2" }} banks={[bank, { id: "b2", name: "ICICI Bank", adCode: "6390002" }]} submitLabel="Save profile" /></Wrap>);
    expect(bankSelect().value).toBe("icici");
    expect(screen.queryByLabelText("Bank name")).toBeNull();
    expect(adInput().value).toBe("6390002");
    await userEvent.clear(adInput());
    await userEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveBank).toHaveBeenCalledWith({ id: "b2", name: "ICICI Bank", adCode: "" });
    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ defaultAdBankId: "b2" }));
  });

  it("switching to another bank that already has a row shows that row's AD code", async () => {
    render(<Wrap api={fakeApi()}><ProfileForm profile={null} banks={[{ id: "b3", name: "Axis Bank", adCode: "1111111" }]} /></Wrap>);
    await userEvent.selectOptions(bankSelect(), "Axis Bank");
    expect(adInput().value).toBe("1111111");
    await userEvent.selectOptions(bankSelect(), "Yes Bank");
    expect(adInput().value).toBe("");
  });

  it("shows a bank-name error from the server against the bank field", async () => {
    const saveBank = vi.fn().mockRejectedValue(new KorraApiError({ kind: "validation", message: "Check the form", fieldErrors: { name: "Enter the bank name" } }));
    render(<Wrap api={fakeApi({ saveBank })}><ProfileForm profile={null} banks={[]} /></Wrap>);
    await fillProfile();
    await userEvent.selectOptions(bankSelect(), "Other bank");
    await userEvent.type(screen.getByLabelText("Bank name"), "X");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Enter the bank name")).toBeTruthy();
  });
});

describe("onboarding screen", () => {
  it("renders the optional step indicator", async () => {
    const onboarding = { profile: null, banks: [bank], complete: false };
    render(<Wrap api={fakeApi({ getOnboarding: vi.fn().mockResolvedValue(onboarding) })}><OnboardingScreen step="Step 1 of 3 · Your details" /></Wrap>);
    expect(await screen.findByText("Step 1 of 3 · Your details")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Set up your details" })).toBeTruthy();
  });

  it("is one form: no AD banks card and no 'Add bank'", async () => {
    render(<Wrap api={fakeApi({ getOnboarding: vi.fn().mockResolvedValue({ profile: null, banks: [], complete: false }) })}><OnboardingScreen /></Wrap>);
    expect(await screen.findByLabelText("Which bank receives your foreign payments?")).toBeTruthy();
    expect(screen.queryByText("Your AD banks")).toBeNull();
    expect(screen.queryByText(/one pack per bank/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Add bank" })).toBeNull();
  });
});
