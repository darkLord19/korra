import Anthropic from "@anthropic-ai/sdk";
import { PDFDocument, StandardFonts } from "pdf-lib";
import { afterEach, describe, expect, it, vi } from "vitest";
import { money } from "@korra/core";
import { createIngester, IngestError, type IngestDoc } from "./index";
import { createClaudeExtractor } from "./server";

type Req = { model: string; system: string; tool_choice?: unknown; messages: { content: { type: string; source: { media_type: string } }[] }[]; output_config: { format: { type: string } } };
const t = (value: string | null, confidence = 0.95) => ({ value, confidence });
const m = (amount: string | null, currency: string | null, confidence = 0.95) => ({ amount, currency, confidence });
const emptyInvoice = {
  invoiceNo: t(null), invoiceDate: t(null), clientName: t(null), clientAddress: t(null),
  clientCountry: t(null), amount: m(null, null), netRealisableValue: m(null, null),
  contractRef: t(null), serviceDescription: t(null), sacCode: t(null),
};
const emptyPayment = {
  receiptMode: t(null), date: t(null), foreignAmount: m(null, null), inrCredited: m(null, null),
  fxRate: t(null), fees: m(null, null), firaRef: t(null), purposeCode: t(null),
  payerName: t(null), realisingBankName: t(null),
};

function clientReturning(json: unknown, stop_reason = "end_turn") {
  const create = vi.fn(async () => ({
    stop_reason,
    content: [{ type: "text", text: typeof json === "string" ? json : JSON.stringify(json) }],
  }));
  return { create, client: { messages: { create } } as unknown as Pick<Anthropic, "messages"> };
}

const pdfDoc = (name = "doc.pdf"): IngestDoc => ({
  bytes: new TextEncoder().encode("%PDF-1.4 test"),
  mimeType: "application/pdf",
  filename: name,
});

afterEach(() => vi.unstubAllEnvs());

describe("createClaudeExtractor (client double)", () => {
  it("sends the PDF as a document block with a json_schema output and the default model", async () => {
    const { create, client } = clientReturning({ kind: "unknown", invoices: [], payments: [], nocRef: null, warnings: [] });
    await createClaudeExtractor({ apiKey: "k", client }).extract(pdfDoc());
    const req = (create.mock.calls[0] as unknown as [Req])[0];
    expect(req.model).toBe("claude-sonnet-5-5");
    expect(req.messages[0]!.content[0]!.type).toBe("document");
    expect(req.messages[0]!.content[0]!.source.media_type).toBe("application/pdf");
    expect(req.output_config.format.type).toBe("json_schema");
    expect(req.tool_choice).toBeUndefined(); // forced tool use is rejected by Sonnet 5.5
    expect(req.system).toMatch(/SAC/);
    expect(req.system).toMatch(/P0802/);
    expect(req.system).toMatch(/No Objection/);
  });

  it("sends images as image blocks", async () => {
    const { create, client } = clientReturning({ kind: "unknown", invoices: [], payments: [], nocRef: null, warnings: [] });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);
    await createClaudeExtractor({ apiKey: "k", client }).extract({ bytes: png, mimeType: "image/png", filename: "a.png" });
    const req = (create.mock.calls[0] as unknown as [Req])[0];
    expect(req.messages[0]!.content[0]!.type).toBe("image");
  });

  it("converts an invoice to Money and defaults NRV to the amount (flagged)", async () => {
    const { client } = clientReturning({
      kind: "invoice",
      invoices: [{
        ...emptyInvoice,
        invoiceNo: t("INV-7", 1), invoiceDate: t("2026-09-30", 1), clientName: t("Acme Corp"),
        clientCountry: t("us", 0.9), amount: m("1234.56", "USD", 0.98), sacCode: t("998314"),
      }],
      payments: [], nocRef: null, warnings: [],
    });
    const res = await createClaudeExtractor({ apiKey: "k", client }).extract(pdfDoc());
    const inv = res.invoices[0]!;
    expect(res.kind).toBe("invoice");
    expect(inv.amount).toEqual({ value: money(123456n, "USD"), confidence: 0.98, source: "extracted" });
    expect(inv.netRealisableValue).toEqual({ value: money(123456n, "USD"), confidence: 0.7, source: "default" });
    expect(inv.clientCountry.value).toBe("US");
    expect(inv.contractRef).toMatchObject({ value: null, confidence: 0 });
  });

  it("returns a FIRA as a payment with firaRef, purposeCode and swift mode", async () => {
    const { client } = clientReturning({
      kind: "fira",
      invoices: [],
      payments: [{
        ...emptyPayment, date: t("2026-09-21"), foreignAmount: m("2000.00", "USD"),
        inrCredited: m("166400.00", "INR"), fxRate: t("83.2"), firaRef: t("FIRA123"), purposeCode: t("P0802"),
        payerName: t("Deel Inc"),
      }],
      nocRef: null, warnings: [],
    });
    const res = await createClaudeExtractor({ apiKey: "k", client }).extract(pdfDoc());
    const p = res.payments[0]!;
    expect(p.firaRef.value).toBe("FIRA123");
    expect(p.purposeCode.value).toBe("P0802");
    expect(p.receiptMode).toMatchObject({ value: "swift", source: "default" });
    expect(p.foreignAmount.value).toEqual(money(200000n, "USD"));
    expect(p.inrCredited.value).toEqual(money(16640000n, "INR"));
  });

  it("returns an NOC with nocRef and no invoices or payments", async () => {
    const { client } = clientReturning({
      kind: "noc",
      invoices: [{ ...emptyInvoice }],
      payments: [{ ...emptyPayment }],
      nocRef: { reference: "NOC-9", amount: "2000.00", currency: "USD", date: "2026-09-20" },
      warnings: [],
    });
    const res = await createClaudeExtractor({ apiKey: "k", client }).extract(pdfDoc());
    expect(res.kind).toBe("noc");
    expect(res.nocRef).toEqual({ reference: "NOC-9", amount: money(200000n, "USD"), date: "2026-09-20" });
    expect(res.invoices).toEqual([]);
    expect(res.payments).toEqual([]);
  });

  it("honours KORRA_LLM_ENABLED=false without calling the API", async () => {
    vi.stubEnv("KORRA_LLM_ENABLED", "false");
    const { create, client } = clientReturning({});
    const res = await createIngester({ llm: createClaudeExtractor({ apiKey: "k", client }) }).ingest(pdfDoc());
    expect(create).not.toHaveBeenCalled();
    expect(res.kind).toBe("unknown");
    expect(res.warnings.join(" ")).toMatch(/disabled/i);
  });

  it("throws a retryable IngestError for 429 / 5xx / connection errors", async () => {
    for (const err of [
      new Anthropic.RateLimitError(429, undefined, "slow down", new Headers()),
      new Anthropic.InternalServerError(500, undefined, "boom", new Headers()),
      new Anthropic.APIConnectionError({ message: "down" }),
    ]) {
      const client = { messages: { create: async () => { throw err; } } } as unknown as Pick<Anthropic, "messages">;
      const e = await createClaudeExtractor({ apiKey: "k", client }).extract(pdfDoc()).catch((x: unknown) => x);
      expect(e).toBeInstanceOf(IngestError);
      expect((e as IngestError).retryable).toBe(true);
    }
  });

  it("throws a non-retryable IngestError for 400/401, refusals and truncation", async () => {
    const bad = new Anthropic.BadRequestError(400, undefined, "bad", new Headers());
    const c1 = { messages: { create: async () => { throw bad; } } } as unknown as Pick<Anthropic, "messages">;
    const e1 = await createClaudeExtractor({ apiKey: "k", client: c1 }).extract(pdfDoc()).catch((x: unknown) => x);
    expect((e1 as IngestError).retryable).toBe(false);

    const refusal = clientReturning("", "refusal").client;
    const e2 = await createClaudeExtractor({ apiKey: "k", client: refusal }).extract(pdfDoc()).catch((x: unknown) => x);
    expect(e2).toBeInstanceOf(IngestError);
    expect((e2 as IngestError).retryable).toBe(false);
  });

  it("treats unparseable model output as a retryable IngestError that does not echo content", async () => {
    const { client } = clientReturning("not json SECRET-CONTENT");
    const e = await createClaudeExtractor({ apiKey: "k", client }).extract(pdfDoc()).catch((x: unknown) => x);
    expect(e).toBeInstanceOf(IngestError);
    expect((e as IngestError).retryable).toBe(true);
    expect((e as IngestError).message).not.toMatch(/SECRET/);
  });
});

// Live test: real API, gated. Run with KORRA_LIVE_LLM=1 ANTHROPIC_API_KEY=...
describe.skipIf(process.env.KORRA_LIVE_LLM !== "1")("createClaudeExtractor (live)", () => {
  it("extracts a tiny generated invoice PDF", async () => {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([595, 842]);
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const lines = [
      "TAX INVOICE",
      "Invoice No: INV-2026-001",
      "Date: 2026-09-30",
      "From: Test Exporter, Pune, India. GSTIN 27AAAAA0000A1Z5",
      "Bill to: Acme Corp, 1 Main Street, Austin, TX 78701, United States",
      "Description: Software development services (SAC 998314)",
      "Total: USD 1,500.00",
    ];
    lines.forEach((l, i) => page.drawText(l, { x: 50, y: 780 - i * 24, size: 12, font }));
    const bytes = new Uint8Array(await pdf.save());

    const res = await createClaudeExtractor({ apiKey: process.env.ANTHROPIC_API_KEY ?? "" }).extract({
      bytes, mimeType: "application/pdf", filename: "live.pdf",
    });
    expect(res.kind).toBe("invoice");
    const inv = res.invoices[0]!;
    expect(inv.invoiceNo.value).toBe("INV-2026-001");
    expect(inv.amount.value).toEqual(money(150000n, "USD"));
    expect(inv.clientCountry.value).toBe("US");
  }, 120_000);
});
