import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { PackDownloads } from "../api";
import type { Task } from "../home/tasks";
import { PackView } from "../pack/PackView";
import { PackScreen } from "../screens/PackScreen";
import { Wrap, fakeApi, invoice, monthState } from "../test-utils";
import { PackFlow } from "./PackFlow";

const bank1 = { id: "bank1", name: "Acme Test Bank", adCode: "6390001" };
const generateTask: Task = { id: "generate:2026-09:bank1", kind: "generate", title: "", detail: "", urgency: "fyi", icon: "", month: "2026-09", adBankId: "bank1" };
const submitTask = (packId = "p1"): Task => ({ id: `submit:${packId}`, kind: "submit", title: "", detail: "", urgency: "fyi", icon: "", month: "2026-09", packId, adBankId: "bank1" });

const downloads = (over: Partial<PackDownloads> = {}, packOver: Partial<PackDownloads["pack"]> = {}): PackDownloads => ({
  pack: { id: "p1", month: "2026-09", adBankId: "bank1", layoutId: "acme@0", status: "generated", files: [], generatedAt: "2026-10-01T10:00:00Z", submittedAt: null, ...packOver },
  placeholder: false,
  files: [
    { name: "EDF-acme-2026-09.pdf", mimeType: "application/pdf", url: "blob:edf" },
    { name: "supporting-2026-09.zip", mimeType: "application/zip", url: "blob:zip" },
  ],
  signed: false,
  submission: {
    documents: ["Signed EDF Request Letter (PDF)"],
    signing: { wetSignature: true, seal: false, scannedOk: false, dscOk: false },
    channels: [
      { kind: "email", title: "Email to Branch or Relationship Manager", steps: ["Draft the email.", "Send before due date."], links: [], verified: true },
      { kind: "netbanking", title: "Acme Internet Banking", steps: ["Log in to Acme Trade."], links: [{ label: "Acme Portal", url: "https://acme.example" }], verified: false },
    ],
    email: { subject: "EDF Submission - September 2026 - Acme Test Bank", intro: "Please find attached our EDF submission." },
    sources: [],
  },
  bank: { id: "bank1", name: "Acme Test Bank", adCode: "6390001" },
  summary: { invoiceCount: 1, totals: [{ minor: "150000", currency: "USD" }], exporterName: "Jane Dev", signatoryName: "Jane Dev" },
  profile: { legalName: "Jane Dev", address: "1 St", pan: "ABCDE1234F", gstin: "29ABCDE1234F1Z5", iec: null, defaultSacCodes: [], defaultAdBankId: "bank1", signatoryName: "Jane Dev", signatoryDesignation: "Director", signatureBlobKey: null, sealBlobKey: null },
  ...over,
});

const noop = () => undefined;

describe("PackFlow: generate", () => {
  const makeApi = (over = {}, placeholderLayout = false) => fakeApi({
    getOnboarding: async () => ({ profile: null, banks: [bank1], complete: true }),
    getMonthState: async () => monthState({
      invoices: [invoice(), invoice({ id: "inv2" }), invoice({ id: "inv3", adBankId: { value: "other", confidence: 1, source: "default" } })],
      blockersByBank: [{ adBankId: "bank1", adBankName: "Acme Test Bank", blockers: [], placeholderLayout }],
    }),
    generatePack: vi.fn(async () => ({ ok: true as const, packId: "p1", layoutId: "acme@0", placeholder: false })),
    ...over,
  });

  it("summarises the bank's invoices and totals, makes the pack, and hands over submit:<packId>", async () => {
    const api = makeApi();
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<Wrap api={api}><PackFlow task={generateTask} onDone={onDone} onClose={noop} /></Wrap>);

    expect(await screen.findByText("2 invoices")).toBeTruthy(); // the third belongs to another bank
    expect(screen.getByText(/3,000/)).toBeTruthy();
    expect(screen.getByText(/Acme Test Bank/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Step 1 of 4" })).toBeTruthy();
    expect(screen.queryByText(/RBI format/)).toBeNull();

    await user.click(screen.getByRole("button", { name: "Make my pack" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("submit:p1"));
    expect(api.generatePack).toHaveBeenCalledWith({ month: "2026-09", adBankId: "bank1" });
  });

  it("warns when the bank has no official layout", async () => {
    render(<Wrap api={makeApi({}, true)}><PackFlow task={generateTask} onDone={noop} onClose={noop} /></Wrap>);
    expect(await screen.findByText(/uses the RBI format/)).toBeTruthy();
  });

  it("shows what is in the way when the pack cannot be made", async () => {
    const api = makeApi({ generatePack: vi.fn(async () => ({ ok: false as const, blockers: [{ kind: "missing_field" as const, entity: "exporter" as const, id: "x", field: "pan" }] })) });
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<Wrap api={api}><PackFlow task={generateTask} onDone={onDone} onClose={noop} /></Wrap>);
    await user.click(await screen.findByRole("button", { name: "Make my pack" }));
    expect(await screen.findByText(/Your details are missing the PAN/i)).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Make my pack" }) as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("PackFlow: submit", () => {
  const submitApi = (dl: PackDownloads, over = {}) => fakeApi({
    getPackDownloads: vi.fn(async () => dl),
    saveBank: vi.fn(async (input) => ({ ...bank1, ...input }) as never),
    markPackSubmitted: vi.fn(async () => dl.pack),
    ...over,
  }, { signedUrlsExpire: false });

  it("goes Sign → (wet signature) Send → email captured and drafted → Done → Mark as sent", async () => {
    const api = submitApi(downloads());
    const onDone = vi.fn();
    const user = userEvent.setup();
    render(<Wrap api={api}><PackFlow task={submitTask()} onDone={onDone} onClose={noop} afterSubmit={<p>Back up now</p>} /></Wrap>);

    expect(await screen.findByRole("heading", { name: "Sign your pack" })).toBeTruthy();
    expect(screen.getByRole("img", { name: "Step 2 of 4" })).toBeTruthy();
    expect(api.getPackDownloads).toHaveBeenCalledWith("p1");
    await user.click(screen.getByRole("button", { name: "My bank needs a wet signature" }));

    expect(screen.getByRole("heading", { name: "Send your pack" })).toBeTruthy();
    expect(screen.getByText("Recommended")).toBeTruthy();
    expect(screen.getByText("Email to Branch or Relationship Manager")).toBeTruthy();
    expect(screen.getByText("Other ways to send")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Open in email app" })).toBeNull();
    await user.type(screen.getByLabelText("Branch or RM email"), "rm@acme.in");
    await user.click(screen.getByRole("button", { name: "Save email" }));
    await waitFor(() => expect(api.saveBank).toHaveBeenCalledWith({ id: "bank1", name: "Acme Test Bank", adCode: "6390001", contactEmail: "rm@acme.in", branch: undefined }));

    const link = await screen.findByRole("link", { name: "Open in email app" });
    const href = link.getAttribute("href")!;
    expect(href.startsWith("mailto:rm@acme.in?")).toBe(true);
    expect(href).toContain("EDF%20Submission");
    expect(href).toContain("EDF-acme-2026-09.pdf");
    expect(screen.getByText("EDF Submission - September 2026 - Acme Test Bank")).toBeTruthy(); // the preview shows the subject

    expect(screen.getByText("What's inside")).toBeTruthy();
    expect(screen.getByText("Official EDF request letter / Annexure (PDF) to submit to your bank.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Download pack" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "I've sent it →" }));
    expect(screen.getByRole("heading", { name: "Mark it as sent" })).toBeTruthy();
    expect(screen.getByText("Bank acknowledgement (optional)")).toBeTruthy();
    expect(screen.getByRole("img", { name: "Step 4 of 4" })).toBeTruthy();
    expect(api.markPackSubmitted).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Mark as sent" }));
    expect(await screen.findByText("Sent!")).toBeTruthy();
    expect(api.markPackSubmitted).toHaveBeenCalledWith({ packId: "p1" });
    expect(screen.getByText("Back up now")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next up →" }));
    expect(onDone).toHaveBeenCalledWith();
  });

  it("signs with the saved signature by making the pack again, and continues with the new pack", async () => {
    const withSig = downloads({ profile: { ...downloads().profile!, signatureBlobKey: "k", signatureUrl: "blob:sig" } });
    const signed = downloads({ signed: true, profile: withSig.profile }, { id: "p2" });
    const api = submitApi(withSig, {
      getPackDownloads: vi.fn(async (id: string) => (id === "p2" ? signed : withSig)),
      generatePack: vi.fn(async () => ({ ok: true as const, packId: "p2", layoutId: "acme@0", placeholder: false })),
    });
    const user = userEvent.setup();
    render(<Wrap api={api}><PackFlow task={submitTask()} onDone={noop} onClose={noop} /></Wrap>);

    expect(await screen.findByRole("img", { name: "Your signature" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Redraw" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sign my pack" }));

    expect(await screen.findByRole("heading", { name: "Send your pack" })).toBeTruthy();
    expect(api.generatePack).toHaveBeenCalledWith({ month: "2026-09", adBankId: "bank1" });
    await waitFor(() => expect(api.getPackDownloads).toHaveBeenCalledWith("p2"));
  });

  it("shows the signature pad to draw a new one", async () => {
    const withSig = downloads({ profile: { ...downloads().profile!, signatureBlobKey: "k", signatureUrl: "blob:sig" } });
    const user = userEvent.setup();
    render(<Wrap api={submitApi(withSig)}><PackFlow task={submitTask()} onDone={noop} onClose={noop} /></Wrap>);
    await user.click(await screen.findByRole("button", { name: "Redraw" }));
    expect(screen.getByText("Draw your signature")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign my pack" })).toBeTruthy(); // the pad's own save button
  });

  it("starts at Send when the pack is already signed, and saves an optional AD code keeping the other bank fields", async () => {
    const dl = downloads({ signed: true, bank: { id: "bank1", name: "Acme Test Bank", adCode: "", contactEmail: "rm@acme.in", branch: "Fort" } });
    const api = submitApi(dl);
    const user = userEvent.setup();
    render(<Wrap api={api}><PackFlow task={submitTask()} onDone={noop} onClose={noop} /></Wrap>);

    expect(await screen.findByRole("heading", { name: "Send your pack" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open in email app" })).toBeTruthy();
    await user.type(screen.getByLabelText("AD code (optional)"), "123456");
    await user.click(screen.getByRole("button", { name: "Save AD code" }));
    await waitFor(() => expect(api.saveBank).toHaveBeenCalledWith({ id: "bank1", name: "Acme Test Bank", adCode: "123456", contactEmail: "rm@acme.in", branch: "Fort" }));
    await waitFor(() => expect(screen.queryByLabelText("AD code (optional)")).toBeNull());
  });

  it("opens on the celebration when the pack was already sent", async () => {
    const dl = downloads({ signed: true }, { status: "submitted", submittedAt: "2026-10-05T00:00:00Z" });
    render(<Wrap api={submitApi(dl)}><PackFlow task={submitTask()} onDone={noop} onClose={noop} afterSubmit={<p>Back up now</p>} /></Wrap>);
    expect(await screen.findByText("Sent!")).toBeTruthy();
    expect(screen.getByText(/keep an eye on payments/)).toBeTruthy();
    expect(screen.getByText("Back up now")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next up →" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mark as sent" })).toBeNull();
  });

  it("explains when marking as sent fails", async () => {
    const api = submitApi(downloads({ signed: true }), { markPackSubmitted: vi.fn(async () => { throw new Error("offline"); }) });
    const user = userEvent.setup();
    render(<Wrap api={api}><PackFlow task={submitTask()} onDone={noop} onClose={noop} /></Wrap>);
    await user.click(await screen.findByRole("button", { name: "I've sent it →" }));
    await user.click(screen.getByRole("button", { name: "Mark as sent" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.queryByText("Sent!")).toBeNull();
  });
});

describe("PackView and PackScreen", () => {
  it("readOnly shows the header, summary and file links, and nothing to sign or send", () => {
    render(<Wrap api={fakeApi()}><PackView downloads={downloads({ signed: true })} readOnly /></Wrap>);
    expect(screen.getByRole("heading", { name: "EDF pack for September 2026" })).toBeTruthy();
    expect(screen.getByText("Not submitted yet")).toBeTruthy();
    expect(screen.getByText("1 invoice")).toBeTruthy();
    expect(screen.getByText("What's inside")).toBeTruthy();
    expect((screen.getByRole("link", { name: "Download EDF-acme-2026-09.pdf" }) as HTMLAnchorElement).getAttribute("href")).toBe("blob:edf");
    expect(screen.queryByRole("button", { name: /Sign|Send|sent/ })).toBeNull();
    expect(screen.queryByText("Email to Branch or Relationship Manager")).toBeNull();
  });

  it("readOnly shows the submitted date, and the expiry note when links expire", () => {
    render(
      <Wrap api={fakeApi({}, { signedUrlsExpire: true })}>
        <PackView downloads={downloads({}, { status: "submitted", submittedAt: "2026-10-05T00:00:00Z" })} readOnly />
      </Wrap>,
    );
    expect(screen.getByText(/Submitted 5 Oct 2026/)).toBeTruthy();
    expect(screen.getByText("Download links work for 10 minutes. Reload this page for fresh ones.")).toBeTruthy();
  });

  it("the owner's PackView renders the flow for that pack", async () => {
    const dl = downloads({ signed: true });
    render(<Wrap api={fakeApi({ getPackDownloads: vi.fn(async () => dl) })}><PackView downloads={dl} /></Wrap>);
    expect(screen.getByRole("heading", { name: "Send your pack" })).toBeTruthy(); // from `downloads`, without loading
  });

  it("PackScreen shows the summary and files for a pack that was already sent", async () => {
    const dl = downloads({ signed: true }, { status: "submitted", submittedAt: "2026-10-05T00:00:00Z" });
    render(<Wrap api={fakeApi({ getPackDownloads: vi.fn(async () => dl) })}><PackScreen packId="p1" /></Wrap>);
    expect(await screen.findByRole("heading", { name: "EDF pack for September 2026" })).toBeTruthy();
    expect(screen.queryByText("Sent!")).toBeNull();
  });
});
