import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Stepper } from "./components/Stepper";
import { KorraApiError } from "./errors";
import { ProfileForm } from "./forms/ProfileForm";
import { SignaturePad } from "./forms/SignaturePad";
import { OnboardingScreen } from "./screens/OnboardingScreen";
import { SettingsScreen } from "./screens/SettingsScreen";
import { Wrap, fakeApi } from "./test-utils";

const bank = { id: "bank1", name: "Acme Test Bank", adCode: "6390001" };

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

describe("profile form: filling it from an invoice", () => {
  const NONE = { legalName: null, address: null, gstin: null, pan: null, sacCode: null, bankKey: null, otherBankName: null, invoiceMonth: null };
  const FOUND = { legalName: "Jane Dev Consulting", address: "12 MG Road, Bengaluru 560001, India", gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F", sacCode: "998314", bankKey: "hdfc", otherBankName: null, invoiceMonth: "2026-09" };
  const pdf = (name = "invoice-042.pdf") => new File(["%PDF-1.4"], name, { type: "application/pdf" });
  const drop = (file: File) => userEvent.upload(screen.getByTestId("invoice-fill-input"), file);
  const val = (label: string | RegExp) => (screen.getByLabelText(label) as HTMLInputElement).value;
  const form = (suggestion: object, props: Partial<Parameters<typeof ProfileForm>[0]> = {}, banks: Parameters<typeof ProfileForm>[0]["banks"] = []) => {
    const extractProfileFromInvoice = vi.fn().mockResolvedValue(suggestion);
    const saveProfile = vi.fn().mockResolvedValue({});
    const saveBank = vi.fn().mockResolvedValue({ id: "b1", name: "HDFC Bank", adCode: "" });
    render(<Wrap api={fakeApi({ extractProfileFromInvoice, saveProfile, saveBank })}><ProfileForm profile={null} banks={banks} fillFromInvoice {...props} /></Wrap>);
    return { extractProfileFromInvoice, saveProfile, saveBank };
  };

  it("is offered on the onboarding screen only, not in settings", async () => {
    render(<Wrap api={fakeApi({ getOnboarding: vi.fn().mockResolvedValue({ profile: null, banks: [], complete: false }) })}><OnboardingScreen /></Wrap>);
    expect(await screen.findByText("Have an invoice handy? Drop it here to fill this in")).toBeTruthy();
    render(<Wrap api={fakeApi()}><ProfileForm profile={null} banks={[]} /></Wrap>);
    expect(screen.getAllByTestId("invoice-fill-input")).toHaveLength(1);
  });

  it("fills the empty fields, names them, and saves nothing", async () => {
    const { saveProfile, saveBank } = form(FOUND);
    await drop(pdf());
    expect(await screen.findByText("Filled from invoice-042.pdf: name, address, GSTIN, PAN, bank. Check them before saving.")).toBeTruthy();
    expect(val("Legal name")).toBe("Jane Dev Consulting");
    expect(val("Registered address")).toBe("12 MG Road, Bengaluru 560001, India");
    expect(val("GSTIN")).toBe("29ABCDE1234F1Z5");
    expect(val("PAN")).toBe("ABCDE1234F");
    expect(val("Which bank receives your foreign payments?")).toBe("hdfc");
    expect(saveProfile).not.toHaveBeenCalled();
    expect(saveBank).not.toHaveBeenCalled();
  });

  it("fills ONLY empty fields: what the person typed is left alone", async () => {
    form(FOUND);
    await userEvent.type(screen.getByLabelText("Legal name"), "My Own Name");
    await userEvent.type(screen.getByLabelText("PAN"), "ZZZZZ9999Z");
    await userEvent.selectOptions(screen.getByLabelText("Which bank receives your foreign payments?"), "Axis Bank");
    await drop(pdf());
    expect(await screen.findByText("Filled from invoice-042.pdf: address, GSTIN. Check them before saving.")).toBeTruthy();
    expect(val("Legal name")).toBe("My Own Name");
    expect(val("PAN")).toBe("ZZZZZ9999Z");
    expect(val("Which bank receives your foreign payments?")).toBe("axis");
    expect(val("GSTIN")).toBe("29ABCDE1234F1Z5");
    expect(screen.getByText(/Doesn't match the PAN inside your GSTIN \(ABCDE1234F\)\./)).toBeTruthy(); // the soft warning still works
  });

  it("derives the PAN from a GSTIN the person already typed, and fills the AD code of an existing bank", async () => {
    form({ ...FOUND, gstin: null, pan: null }, {}, [{ id: "old", name: "HDFC Bank", adCode: "6390009" }]);
    await userEvent.type(screen.getByLabelText("GSTIN"), "29ABCDE1234F1Z5");
    await userEvent.clear(screen.getByLabelText("PAN"));
    await drop(pdf());
    expect(await screen.findByText("Filled from invoice-042.pdf: name, address, PAN, bank. Check them before saving.")).toBeTruthy();
    expect(val("PAN")).toBe("ABCDE1234F");
    expect(val(/^AD code/)).toBe("6390009");
  });

  it("puts a bank that is not in the catalog under 'Other bank'", async () => {
    form({ ...NONE, bankKey: null, otherBankName: "Federal Bank" });
    await drop(pdf());
    expect(await screen.findByText("Filled from invoice-042.pdf: bank. Check them before saving.")).toBeTruthy();
    expect(val("Which bank receives your foreign payments?")).toBe("other");
    expect(val("Bank name")).toBe("Federal Bank");
  });

  it("says so when nothing could be read, when reading fails, and when the file cannot be an invoice", async () => {
    const { extractProfileFromInvoice } = form(NONE);
    await drop(pdf("scan.pdf"));
    expect(await screen.findByText("Couldn't read details from this file; fill them in by hand.")).toBeTruthy();
    expect(val("Legal name")).toBe("");
    extractProfileFromInvoice.mockRejectedValueOnce(new KorraApiError({ kind: "unknown", message: "boom" }));
    await drop(pdf("again.pdf"));
    expect(await screen.findByText("Couldn't read details from this file; fill them in by hand.")).toBeTruthy();
    const pick = (file: File) => fireEvent.change(screen.getByTestId("invoice-fill-input"), { target: { files: [file] } }); // bypasses the picker's accept filter, like a dropped file
    pick(new File(["a,b"], "data.csv", { type: "text/csv" }));
    expect(await screen.findByText("Use a PDF of your invoice.")).toBeTruthy();
    pick(new File([new Uint8Array(20 * 1024 * 1024 + 1)], "huge.pdf", { type: "application/pdf" }));
    expect(await screen.findByText("Files are limited to 20 MB.")).toBeTruthy();
    expect(extractProfileFromInvoice).toHaveBeenCalledTimes(2);
  });

  it("when every field it covers is already filled, says that instead of 'couldn't read'", async () => {
    form({ ...FOUND, sacCode: null });
    for (const [label, v] of [["Legal name", "A"], ["Registered address", "B"], ["GSTIN", "29ABCDE1234F1Z5"]] as const) await userEvent.type(screen.getByLabelText(label), v);
    await userEvent.selectOptions(screen.getByLabelText("Which bank receives your foreign payments?"), "Axis Bank");
    await drop(pdf());
    expect(await screen.findByText("Read invoice-042.pdf, but everything it covers is already filled in.")).toBeTruthy();
  });

  it("hands the invoice and its month to onSaved, so the app can file it", async () => {
    const onSaved = vi.fn();
    const { saveProfile } = form(FOUND, { onSaved });
    const file = pdf();
    await drop(file);
    await screen.findByText(/^Filled from/);
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ file, month: "2026-09" }));
    expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ legalName: "Jane Dev Consulting", pan: "ABCDE1234F" }));
  });

  it("hands over nothing when no invoice was read", async () => {
    const onSaved = vi.fn();
    form(NONE, { onSaved });
    await drop(pdf());
    await screen.findByText(/Couldn't read/);
    for (const [label, v] of [["Legal name", "Jane"], ["Registered address", "12 MG Road"], ["GSTIN", "29ABCDE1234F1Z5"]] as const) await userEvent.type(screen.getByLabelText(label), v);
    await userEvent.selectOptions(screen.getByLabelText("Which bank receives your foreign payments?"), "HDFC Bank");
    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(undefined));
  });
});

describe("onboarding screen", () => {
  it("renders the optional step indicator", async () => {
    const onboarding = { profile: null, banks: [bank], complete: false };
    render(<Wrap api={fakeApi({ getOnboarding: vi.fn().mockResolvedValue(onboarding) })}><OnboardingScreen step={<Stepper current={1} />} /></Wrap>);
    expect(await screen.findByRole("list", { name: "Progress" })).toBeTruthy();
    expect(screen.getByRole("listitem", { current: "step" }).textContent).toContain("Set up");
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

describe("stepper", () => {
  it("marks the current step and the earlier ones as done", () => {
    render(<Stepper current={2} />);
    const items = within(screen.getByRole("list", { name: "Progress" })).getAllByRole("listitem");
    expect(items.map((i) => i.getAttribute("aria-current"))).toEqual([null, "step", null]);
    expect(items[0]!.textContent).toContain("Set up (done)");
    expect(items[1]!.textContent).not.toContain("(done)");
    expect(items[2]!.textContent).not.toContain("(done)");
    expect(items[1]!.textContent).toContain("Upload invoices");
    expect(items[2]!.textContent).toContain("Download your EDF pack");
  });
});

describe("SignaturePad", () => {
  it("renders drawing area, signatory fields, notice, and upload fallback when empty", () => {
    render(
      <Wrap api={fakeApi()}>
        <SignaturePad profile={null} />
      </Wrap>,
    );
    expect(screen.getByLabelText("Authorised signatory name")).toBeTruthy();
    expect(screen.getByLabelText("Designation")).toBeTruthy();
    expect(screen.getByText("This is an image of your signature, not a DSC. Banks that need a DSC-signed EDF will say so in the steps below.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Upload an image instead" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save signature" })).toBeTruthy();
  });

  it("shows saved state and allows removing signature", async () => {
    const clearSignature = vi.fn().mockResolvedValue({
      legalName: "Jane Dev",
      address: "123 St",
      pan: "ABCDE1234F",
      gstin: "29ABCDE1234F1Z5",
      iec: null,
      defaultSacCodes: [],
      defaultAdBankId: "b1",
      signatoryName: null,
      signatoryDesignation: null,
      signatureBlobKey: null,
      sealBlobKey: null,
    });
    const profile = {
      legalName: "Jane Dev",
      address: "123 St",
      pan: "ABCDE1234F",
      gstin: "29ABCDE1234F1Z5",
      iec: null,
      defaultSacCodes: [],
      defaultAdBankId: "b1",
      signatoryName: "Jane Dev",
      signatoryDesignation: "Director",
      signatureBlobKey: "u/1/profile/sig.png",
      signatureUrl: "blob:sig",
      sealBlobKey: null,
    };
    render(
      <Wrap api={fakeApi({ clearSignature })}>
        <SignaturePad profile={profile} />
      </Wrap>,
    );
    expect(screen.getByText("Signature saved")).toBeTruthy();
    expect(screen.getByText(/Jane Dev \(Director\)/)).toBeTruthy();
    const removeBtn = screen.getByRole("button", { name: "Remove" });
    await userEvent.click(removeBtn);
    expect(clearSignature).toHaveBeenCalled();
  });
});

describe("ProfileForm bank contact fields", () => {
  it("renders branch or RM email and branch name inputs and saves them with saveBank", async () => {
    const saveBank = vi.fn().mockResolvedValue({ id: "bank1", name: "State Bank of India", adCode: "6390001", contactEmail: "rm@sbi.co.in", branch: "Fort, Mumbai" });
    const saveProfile = vi.fn().mockResolvedValue({
      legalName: "Jane Dev",
      address: "123 St",
      pan: "ABCDE1234F",
      gstin: "29ABCDE1234F1Z5",
      iec: null,
      defaultSacCodes: [],
      defaultAdBankId: "bank1",
      signatoryName: null,
      signatoryDesignation: null,
      hasSignature: false,
      hasSeal: false,
    });
    const profile = {
      legalName: "Jane Dev",
      address: "123 St",
      pan: "ABCDE1234F",
      gstin: "29ABCDE1234F1Z5",
      iec: null,
      defaultSacCodes: [],
      defaultAdBankId: "bank1",
      signatoryName: null,
      signatoryDesignation: null,
      hasSignature: false,
      hasSeal: false,
    };
    const sbiBank = { id: "bank1", name: "State Bank of India", adCode: "6390001", contactEmail: null, branch: null };

    render(
      <Wrap api={fakeApi({ saveBank, saveProfile })}>
        <ProfileForm profile={profile} banks={[sbiBank]} />
      </Wrap>,
    );

    const emailInput = screen.getByLabelText("Branch or RM email (optional)");
    const branchInput = screen.getByLabelText("Branch name (optional)");
    expect(emailInput).toBeTruthy();
    expect(branchInput).toBeTruthy();

    await userEvent.type(emailInput, "rm@sbi.co.in");
    await userEvent.type(branchInput, "Fort, Mumbai");

    await userEvent.click(screen.getByRole("button", { name: "Save and continue" }));

    await waitFor(() => {
      expect(saveBank).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "bank1",
          name: "State Bank of India",
          contactEmail: "rm@sbi.co.in",
          branch: "Fort, Mumbai",
        }),
      );
    });
  });
});
