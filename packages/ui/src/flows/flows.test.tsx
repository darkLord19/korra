import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { BlockerWire, DocumentWire, ProfileSuggestionWire } from "@korra/backend/schemas";
import { KorraApiError } from "../errors";
import { currentMonthIST, dateLabel } from "../lib/format";
import { panForGstinChange, panMismatch } from "../lib/profile";
import type { Task } from "../home/tasks";
import { FieldEditor } from "../month/FieldEditor";
import { Wrap, fakeApi, field, invoice, monthState } from "../test-utils";
import { ReviewFlow } from "./ReviewFlow";
import { SetupFlow } from "./SetupFlow";
import { UploadFlow } from "./UploadFlow";

const GSTIN = "27ABCDE1234F1Z5";
const PAN = "ABCDE1234F";
const bank1 = { id: "bank1", name: "Acme Test Bank", adCode: "6390001" };
const setupTask: Task = { id: "setup", kind: "setup", title: "Set up", detail: "", urgency: "urgent", icon: "✨" };
const task = (kind: Task["kind"], month = "2026-09"): Task => ({ id: `${kind}:${month}`, kind, title: "", detail: "", urgency: "fyi", icon: "", month });
const pdf = (name = "inv.pdf") => new File(["%PDF-1.4 data"], name, { type: "application/pdf" });
const blockersFor = (blockers: BlockerWire[], adBankId = "bank1") => [{ adBankId, adBankName: "Acme Test Bank", blockers, placeholderLayout: false }];
const flagged = (id: string, f: string, confidence = 0.6): BlockerWire => ({ kind: "flagged_field", entity: "invoice", id, field: f, confidence });
const doc = (id: string, status: DocumentWire["status"]): DocumentWire => ({
  id, kind: "invoice", month: "2026-09", filename: `${id}.pdf`, mimeType: "application/pdf", status, attempts: 0, error: null, createdAt: "2026-09-02T00:00:00Z", invoiceMonths: ["2026-09"],
});

describe("profile helpers", () => {
  it("fills the PAN from a full GSTIN only when the PAN is empty", () => {
    expect(panForGstinChange(GSTIN, "")).toBe(PAN);
    expect(panForGstinChange(GSTIN, "ZZZZZ9999Z")).toBe("ZZZZZ9999Z");
    expect(panForGstinChange("27ABC", "")).toBe("");
  });
  it("reports a PAN that disagrees with the GSTIN", () => {
    expect(panMismatch(GSTIN, "ZZZZZ9999Z")).toBe(PAN);
    expect(panMismatch(GSTIN, PAN)).toBeNull();
    expect(panMismatch(GSTIN, "ZZZZ")).toBeNull();
  });
});

describe("SetupFlow", () => {
  const suggestion: ProfileSuggestionWire = {
    legalName: "Jane Doe", address: "1 Road, Mumbai", gstin: GSTIN, pan: PAN, sacCode: null, bankKey: "hdfc", otherBankName: null, invoiceMonth: "2026-08",
  };
  const setupApi = (over = {}) => fakeApi({
    getOnboarding: async () => ({ profile: null, banks: [], complete: false }),
    saveBank: vi.fn(async () => ({ id: "b1", name: "HDFC Bank", adCode: "" })),
    saveProfile: vi.fn(async () => ({}) as never),
    uploadFile: vi.fn(async () => ({ documentId: "d1" })),
    ...over,
  });

  it("reads an invoice, skips the bank step, saves the bank then the profile, files the invoice, and hands over upload:<month>", async () => {
    const extract = vi.fn(async () => suggestion);
    const api = setupApi({ extractProfileFromInvoice: extract });
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<Wrap api={api}><SetupFlow task={setupTask} onDone={onDone} onClose={() => undefined} /></Wrap>);

    const file = pdf();
    await user.upload(await screen.findByTestId("invoice-fill-input"), file);
    expect(await screen.findByRole("heading", { name: "Is this you?" })).toBeTruthy();
    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText(GSTIN)).toBeTruthy();
    expect(screen.getByText(PAN)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Step 2 of 2" })).toBeTruthy(); // the bank step is skipped
    expect(screen.getByText("HDFC Bank")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Looks right, save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("upload:2026-08"));
    expect(api.saveBank).toHaveBeenCalledWith({ name: "HDFC Bank", adCode: "" });
    expect(api.saveProfile).toHaveBeenCalledWith({
      legalName: "Jane Doe", address: "1 Road, Mumbai", pan: PAN, gstin: GSTIN, iec: null, defaultSacCodes: [], defaultAdBankId: "b1",
    });
    expect(api.uploadFile).toHaveBeenCalledWith(file, { month: "2026-08", hint: "invoice" });
    const order = [api.saveBank, api.saveProfile, api.uploadFile].map((f) => vi.mocked(f).mock.invocationCallOrder[0]!);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });

  it("turns a row into an input with the pencil", async () => {
    const api = setupApi({ extractProfileFromInvoice: async () => suggestion });
    const user = userEvent.setup();
    render(<Wrap api={api}><SetupFlow task={setupTask} onDone={() => undefined} onClose={() => undefined} /></Wrap>);
    await user.upload(await screen.findByTestId("invoice-fill-input"), pdf());
    await screen.findByText("Jane Doe");
    expect(screen.queryByLabelText("Legal name")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Edit Legal name" }));
    expect((screen.getByLabelText("Legal name") as HTMLInputElement).value).toBe("Jane Doe");
  });

  it("stays on the drop step when the invoice can't be read", async () => {
    const empty = { legalName: null, address: null, gstin: null, pan: null, sacCode: null, bankKey: null, otherBankName: null, invoiceMonth: null };
    const api = setupApi({ extractProfileFromInvoice: async () => empty });
    const user = userEvent.setup();
    render(<Wrap api={api}><SetupFlow task={setupTask} onDone={() => undefined} onClose={() => undefined} /></Wrap>);
    await user.upload(await screen.findByTestId("invoice-fill-input"), pdf());
    expect(await screen.findByText(/Couldn't read details/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Drop an invoice" })).toBeTruthy();
  });

  it("fills it in by hand: empty inputs, then the bank list, then save", async () => {
    const api = setupApi({ saveBank: vi.fn(async () => ({ id: "b2", name: "Axis Bank", adCode: "" })) });
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<Wrap api={api}><SetupFlow task={setupTask} onDone={onDone} onClose={() => undefined} /></Wrap>);

    await user.click(await screen.findByRole("button", { name: "No invoice handy? Fill it in yourself" }));
    expect((screen.getByLabelText("Legal name") as HTMLInputElement).value).toBe("");
    expect(screen.getByRole("img", { name: "Step 2 of 3" })).toBeTruthy();
    const next = screen.getByRole("button", { name: "Looks right" }) as HTMLButtonElement;
    expect(next.disabled).toBe(true);
    await user.type(screen.getByLabelText("Legal name"), "Jane Doe");
    await user.type(screen.getByLabelText("Registered address"), "1 Road");
    await user.type(screen.getByLabelText("GSTIN"), GSTIN);
    expect(next.disabled).toBe(false);
    await user.click(screen.getByRole("button", { name: "Add IEC" }));
    await user.type(screen.getByLabelText(/IEC/), "0123456789");
    await user.click(next);

    expect(await screen.findByRole("heading", { name: "Your bank" })).toBeTruthy();
    expect(screen.getAllByRole("radio")).toHaveLength(11); // the catalog plus "Other bank"
    expect((screen.getByRole("button", { name: "Save and continue" }) as HTMLButtonElement).disabled).toBe(true);
    await user.click(screen.getByRole("radio", { name: "Axis Bank" }));
    await user.click(screen.getByRole("button", { name: "Save and continue" }));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith(`upload:${currentMonthIST()}`));
    expect(api.saveBank).toHaveBeenCalledWith({ name: "Axis Bank", adCode: "" });
    expect(api.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ legalName: "Jane Doe", pan: PAN, iec: "0123456789", defaultAdBankId: "b2" }));
    expect(api.uploadFile).not.toHaveBeenCalled();
  });

  it("takes a typed name for another bank", async () => {
    const api = setupApi({ saveBank: vi.fn(async () => ({ id: "b3", name: "Federal Bank", adCode: "" })) });
    const user = userEvent.setup();
    render(<Wrap api={api}><SetupFlow task={setupTask} onDone={() => undefined} onClose={() => undefined} /></Wrap>);
    await user.click(await screen.findByRole("button", { name: /Fill it in yourself/ }));
    await user.type(screen.getByLabelText("Legal name"), "Jane");
    await user.type(screen.getByLabelText("Registered address"), "1 Road");
    await user.type(screen.getByLabelText("GSTIN"), GSTIN);
    await user.click(screen.getByRole("button", { name: "Looks right" }));
    await user.click(screen.getByRole("radio", { name: "Other bank" }));
    await user.type(screen.getByLabelText("Bank name"), "Federal Bank");
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(api.saveBank).toHaveBeenCalledWith({ name: "Federal Bank", adCode: "" }));
  });

  it("fills the PAN from the GSTIN, and warns when a typed PAN disagrees", async () => {
    const api = setupApi();
    const user = userEvent.setup();
    render(<Wrap api={api}><SetupFlow task={setupTask} onDone={() => undefined} onClose={() => undefined} /></Wrap>);
    await user.click(await screen.findByRole("button", { name: /Fill it in yourself/ }));
    await user.type(screen.getByLabelText("GSTIN"), GSTIN);
    expect((screen.getByLabelText("PAN") as HTMLInputElement).value).toBe(PAN);
    await user.clear(screen.getByLabelText("PAN"));
    await user.type(screen.getByLabelText("PAN"), "ZZZZZ9999Z");
    expect(screen.getByText(/Doesn't match the PAN inside your GSTIN \(ABCDE1234F\)/)).toBeTruthy();
  });

  it("goes back to the step that owns the field when saving fails", async () => {
    const api = setupApi({
      saveProfile: vi.fn(async () => { throw new KorraApiError({ kind: "validation", message: "invalid", fieldErrors: { pan: "PAN looks like ABCDE1234F" } }); }),
    });
    const user = userEvent.setup();
    render(<Wrap api={api}><SetupFlow task={setupTask} onDone={() => undefined} onClose={() => undefined} /></Wrap>);
    await user.click(await screen.findByRole("button", { name: /Fill it in yourself/ }));
    await user.type(screen.getByLabelText("Legal name"), "Jane");
    await user.type(screen.getByLabelText("Registered address"), "1 Road");
    await user.type(screen.getByLabelText("GSTIN"), GSTIN);
    await user.click(screen.getByRole("button", { name: "Looks right" }));
    await user.click(screen.getByRole("radio", { name: "HDFC Bank" }));
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByRole("heading", { name: "Is this you?" })).toBeTruthy();
    expect(screen.getByText("PAN looks like ABCDE1234F")).toBeTruthy();
  });
});

describe("UploadFlow", () => {
  const goodState = (documents: DocumentWire[] = []) => monthState({ documents, invoices: [invoice()], blockersByBank: blockersFor([]) });
  const continueBtn = () => screen.getByRole("button", { name: "Continue" }) as HTMLButtonElement;

  it("shows Reading… then Read ✓ per file, and enables Continue only when nothing is being read", async () => {
    let docs: DocumentWire[] = [];
    const api = fakeApi({
      getOnboarding: async () => ({ profile: null, banks: [bank1], complete: true }),
      getMonthState: async () => goodState(docs),
      uploadFile: vi.fn(async () => { docs = [doc("d1", "ingesting")]; return { documentId: "d1" }; }),
    });
    const user = userEvent.setup();
    render(<Wrap api={api}><UploadFlow task={task("upload")} onDone={() => undefined} onClose={() => undefined} /></Wrap>);
    await waitFor(() => expect(continueBtn().disabled).toBe(false));
    expect(screen.getByText("Drop invoices or a Deel CSV")).toBeTruthy();

    await user.upload(screen.getByTestId("file-input"), pdf("d1.pdf"));
    expect(await screen.findByText("Reading…")).toBeTruthy();
    expect(continueBtn().disabled).toBe(true);

    docs = [doc("d1", "ingested")]; // the next poll (every 2s) sees it read
    expect(await screen.findByText("Read ✓", {}, { timeout: 5000 })).toBeTruthy();
    expect(continueBtn().disabled).toBe(false);
  });

  it("shows Failed for a file that could not be read", async () => {
    const api = fakeApi({
      getOnboarding: async () => ({ profile: null, banks: [bank1], complete: true }),
      getMonthState: async () => goodState([doc("d1", "failed")]),
      uploadFile: async () => ({ documentId: "d1" }),
    });
    const user = userEvent.setup();
    render(<Wrap api={api}><UploadFlow task={task("upload")} onDone={() => undefined} onClose={() => undefined} /></Wrap>);
    await user.upload(await screen.findByTestId("file-input"), pdf("d1.pdf"));
    expect(await screen.findByText("Failed")).toBeTruthy();
  });

  it("rejects an empty file without calling the API", async () => {
    const upload = vi.fn();
    const api = fakeApi({
      getOnboarding: async () => ({ profile: null, banks: [bank1], complete: true }),
      getMonthState: async () => goodState(),
      uploadFile: upload,
    });
    const user = userEvent.setup();
    render(<Wrap api={api}><UploadFlow task={task("upload")} onDone={() => undefined} onClose={() => undefined} /></Wrap>);
    await user.upload(await screen.findByTestId("file-input"), new File([], "empty.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("This file is empty.")).toBeTruthy();
    expect(upload).not.toHaveBeenCalled();
  });

  it("continues to review when a field is flagged", async () => {
    const api = fakeApi({
      getOnboarding: async () => ({ profile: null, banks: [bank1], complete: true }),
      getMonthState: async () => monthState({ invoices: [invoice()], blockersByBank: blockersFor([flagged("inv1", "sacCode")]) }),
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<Wrap api={api}><UploadFlow task={task("upload")} onDone={onDone} onClose={() => undefined} /></Wrap>);
    await waitFor(() => expect(continueBtn().disabled).toBe(false));
    await user.click(continueBtn());
    expect(onDone).toHaveBeenCalledWith("review:2026-09");
  });

  it("continues to review when an invoice field is missing", async () => {
    const api = fakeApi({
      getOnboarding: async () => ({ profile: null, banks: [bank1], complete: true }),
      getMonthState: async () => monthState({ invoices: [invoice()], blockersByBank: blockersFor([{ kind: "missing_field", entity: "invoice", id: "inv1", field: "invoiceDate" }]) }),
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<Wrap api={api}><UploadFlow task={task("upload")} onDone={onDone} onClose={() => undefined} /></Wrap>);
    await waitFor(() => expect(continueBtn().disabled).toBe(false));
    await user.click(continueBtn());
    expect(onDone).toHaveBeenCalledWith("review:2026-09");
  });

  it("continues to making the pack, with the first bank, when nothing needs a look", async () => {
    const api = fakeApi({
      getOnboarding: async () => ({ profile: null, banks: [bank1, { id: "bank2", name: "Other", adCode: "" }], complete: true }),
      getMonthState: async () => goodState(),
    });
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<Wrap api={api}><UploadFlow task={task("upload")} onDone={onDone} onClose={() => undefined} /></Wrap>);
    await waitFor(() => expect(continueBtn().disabled).toBe(false));
    await user.click(continueBtn());
    expect(onDone).toHaveBeenCalledWith("generate:2026-09:bank1");
  });

  it("opens the by-hand invoice form in a sheet", async () => {
    const api = fakeApi({
      getOnboarding: async () => ({ profile: null, banks: [bank1], complete: true }),
      getMonthState: async () => goodState(),
    });
    const user = userEvent.setup();
    render(<Wrap api={api}><UploadFlow task={task("upload")} onDone={() => undefined} onClose={() => undefined} /></Wrap>);
    await user.click(await screen.findByRole("button", { name: "Add an invoice by hand" }));
    expect(await screen.findByRole("heading", { name: "Add an invoice by hand" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save invoice" })).toBeTruthy();
  });
});

describe("ReviewFlow", () => {
  /** getMonthState returns `first` once, then `after` for every later call. */
  const reviewApi = (first: ReturnType<typeof monthState>, after: ReturnType<typeof monthState>, over = {}) => {
    const getMonthState = vi.fn().mockResolvedValueOnce(first).mockResolvedValue(after);
    return fakeApi({
      getOnboarding: async () => ({ profile: null, banks: [bank1], complete: true }),
      getMonthState,
      editField: vi.fn(async () => undefined),
      confirmAllFields: vi.fn(async () => ({ entity: "invoice" as const, id: "inv1", changed: [] })),
      ...over,
    });
  };
  const cleared = monthState({ invoices: [invoice()], blockersByBank: blockersFor([]) });
  const sacFlagged = monthState({ invoices: [invoice()], blockersByBank: blockersFor([flagged("inv1", "sacCode")]) });
  const twoFlags = monthState({ invoices: [invoice()], blockersByBank: blockersFor([flagged("inv1", "sacCode"), flagged("inv1", "clientName", 0.3)]) });
  const run = (api: ReturnType<typeof fakeApi>, onDone = vi.fn()) =>
    render(<Wrap api={api}><ReviewFlow task={task("review")} onDone={onDone} onClose={() => undefined} /></Wrap>);

  it("describes what Korra read and how sure it was", async () => {
    run(reviewApi(sacFlagged, cleared));
    const sentence = await screen.findByText(/Korra read/);
    expect(sentence.textContent).toBe("Korra read 998314 as the SAC code on INV-1");
    expect(screen.getByText("Fairly sure (60%)")).toBeTruthy();
  });

  it("says Not sure under 50%, and formats money like the cell does", async () => {
    const state = monthState({
      invoices: [invoice({ amount: field({ minor: "150000", currency: "USD" }, 0.3) })],
      blockersByBank: blockersFor([flagged("inv1", "amount", 0.3)]),
    });
    run(reviewApi(state, cleared));
    expect((await screen.findByText(/Korra read/)).textContent).toBe("Korra read USD 1,500.00 as the invoice amount on INV-1");
    expect(screen.getByText("Not sure (30%)")).toBeTruthy();
  });

  it("names the invoice number's own invoice as 'this invoice', and reads dates as dates", async () => {
    const noFlagged = monthState({ invoices: [invoice({ invoiceNo: field("INV-1", 0.4) })], blockersByBank: blockersFor([flagged("inv1", "invoiceNo", 0.4)]) });
    const { unmount } = run(reviewApi(noFlagged, cleared));
    expect((await screen.findByText(/Korra read/)).textContent).toBe("Korra read INV-1 as the invoice number on this invoice");
    unmount();
    const dated = monthState({ invoices: [invoice({ invoiceDate: field("2026-09-02", 0.4) })], blockersByBank: blockersFor([flagged("inv1", "invoiceDate", 0.4)]) });
    run(reviewApi(dated, cleared));
    expect((await screen.findByText(/Korra read/)).textContent).toBe(`Korra read ${dateLabel("2026-09-02")} as the invoice date on INV-1`);
  });

  it("starts a missing-number sentence with a capital, and keeps acronyms as they are", async () => {
    const state = monthState({
      invoices: [invoice({ invoiceNo: field<string>(null, 0, "default") })],
      blockersByBank: blockersFor([{ kind: "missing_field", entity: "invoice", id: "inv1", field: "invoiceNo" }]),
    });
    const { unmount } = run(reviewApi(state, cleared));
    expect(await screen.findByText("This invoice is missing its invoice number")).toBeTruthy();
    unmount();
    const sac = monthState({
      invoices: [invoice({ sacCode: field<string>(null, 0, "default") })],
      blockersByBank: blockersFor([{ kind: "missing_field", entity: "invoice", id: "inv1", field: "sacCode" }]),
    });
    run(reviewApi(sac, cleared));
    expect(await screen.findByText("INV-1 is missing its SAC code")).toBeTruthy();
  });

  it("'Looks right' saves the same value and reloads", async () => {
    const api = reviewApi(sacFlagged, cleared);
    const user = userEvent.setup();
    run(api);
    await user.click(await screen.findByRole("button", { name: "Looks right" }));
    expect(api.editField).toHaveBeenCalledWith({ entity: "invoice", id: "inv1", field: "sacCode", value: "998314" });
    expect(await screen.findByText("All checked ✓")).toBeTruthy();
  });

  it("'Fix it' saves a new value", async () => {
    const api = reviewApi(sacFlagged, cleared);
    const user = userEvent.setup();
    run(api);
    await user.click(await screen.findByRole("button", { name: "Fix it" }));
    const input = screen.getByLabelText("SAC code");
    await user.clear(input);
    await user.type(input, "998313");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.editField).toHaveBeenCalledWith({ entity: "invoice", id: "inv1", field: "sacCode", value: "998313" }));
    expect(await screen.findByText("All checked ✓")).toBeTruthy();
  });

  it("shows a save error and keeps the card", async () => {
    const api = reviewApi(sacFlagged, cleared, { editField: async () => { throw new KorraApiError({ kind: "validation", message: "SAC code is 4 to 8 digits" }); } });
    const user = userEvent.setup();
    run(api);
    await user.click(await screen.findByRole("button", { name: "Fix it" }));
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByLabelText("SAC code")).toBeTruthy();
  });

  it("orders by field, and Skip moves the item to the end", async () => {
    const user = userEvent.setup();
    run(reviewApi(twoFlags, cleared));
    expect((await screen.findByText(/Korra read/)).textContent).toBe("Korra read Acme Corp as the client name on INV-1");
    expect(screen.getByRole("img", { name: "Step 1 of 2" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText(/Korra read/).textContent).toBe("Korra read 998314 as the SAC code on INV-1");
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(screen.getByText(/Korra read/).textContent).toContain("client name");
  });

  it("de-duplicates items that every bank repeats", async () => {
    const state = monthState({
      invoices: [invoice()],
      blockersByBank: [...blockersFor([flagged("inv1", "sacCode")]), ...blockersFor([flagged("inv1", "sacCode")], "bank2")],
    });
    run(reviewApi(state, cleared));
    await screen.findByText(/Korra read/);
    expect(screen.getByRole("img", { name: "Step 1 of 1" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Skip" })).toBeNull();
  });

  it("confirms everything on an invoice with two or more flags", async () => {
    const api = reviewApi(twoFlags, cleared);
    const user = userEvent.setup();
    run(api);
    await user.click(await screen.findByRole("button", { name: "Everything on INV-1 looks right" }));
    expect(api.confirmAllFields).toHaveBeenCalledWith({ entity: "invoice", id: "inv1" });
    expect(await screen.findByText("All checked ✓")).toBeTruthy();
  });

  it("offers no confirm-all for a single flag", async () => {
    run(reviewApi(sacFlagged, cleared));
    await screen.findByText(/Korra read/);
    expect(screen.queryByRole("button", { name: /Everything on/ })).toBeNull();
  });

  it("asks for a missing field with the input shown directly", async () => {
    const state = monthState({
      invoices: [invoice({ clientCountry: field<string>(null, 0, "default") })],
      blockersByBank: blockersFor([{ kind: "missing_field", entity: "invoice", id: "inv1", field: "clientCountry" }]),
    });
    const api = reviewApi(state, cleared);
    const user = userEvent.setup();
    run(api);
    expect(await screen.findByText("INV-1 is missing its client country")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Looks right" })).toBeNull();
    await user.type(screen.getByLabelText("Client country"), "US");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(api.editField).toHaveBeenCalledWith({ entity: "invoice", id: "inv1", field: "clientCountry", value: "US" }));
  });

  it("with nothing to check says All checked, and Make my pack goes to generate", async () => {
    const onDone = vi.fn();
    const user = userEvent.setup();
    run(reviewApi(cleared, cleared), onDone);
    expect(await screen.findByText("All checked ✓")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Make my pack" }));
    expect(onDone).toHaveBeenCalledWith("generate:2026-09:bank1");
  });

  it("Make my pack hands over to Home when every bank still has blockers", async () => {
    const state = monthState({ invoices: [invoice()], blockersByBank: blockersFor([{ kind: "missing_field", entity: "exporter", id: "x", field: "pan" }]) });
    const onDone = vi.fn();
    const user = userEvent.setup();
    run(reviewApi(state, state), onDone);
    await user.click(await screen.findByRole("button", { name: "Make my pack" }));
    expect(onDone).toHaveBeenCalledWith();
  });
});

describe("FieldEditor", () => {
  const money = field({ minor: "150000", currency: "USD" });

  it("explains a money amount with the wrong number of decimals, and does not save", async () => {
    const editField = vi.fn();
    const user = userEvent.setup();
    render(<Wrap api={fakeApi({ editField })}><FieldEditor entity="invoice" id="inv1" field="amount" kind="money" data={money} banks={[]} label="Invoice amount" onSaved={() => undefined} onCancel={() => undefined} /></Wrap>);
    const amount = screen.getByLabelText("Invoice amount amount");
    expect((amount as HTMLInputElement).value).toBe("1500.00");
    await user.clear(amount);
    await user.type(amount, "12.345");
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Enter an amount in USD with the right number of decimals.");
    expect(editField).not.toHaveBeenCalled();
  });

  it("converts to minor units and calls onSaved", async () => {
    const editField = vi.fn(async () => undefined);
    const onSaved = vi.fn();
    const user = userEvent.setup();
    render(<Wrap api={fakeApi({ editField })}><FieldEditor entity="invoice" id="inv1" field="amount" kind="money" data={money} banks={[]} label="Invoice amount" onSaved={onSaved} submitLabel="Confirm" /></Wrap>);
    const amount = screen.getByLabelText("Invoice amount amount");
    await user.clear(amount);
    await user.type(amount, "1,200.5");
    await user.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(editField).toHaveBeenCalledWith({ entity: "invoice", id: "inv1", field: "amount", value: { minor: "120050", currency: "USD" } });
    expect(screen.queryByRole("button", { name: "Cancel" })).toBeNull();
  });
});
