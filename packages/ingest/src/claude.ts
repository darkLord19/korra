import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { GSTIN_RE, IFSC_RE, panFromGstin, type Field, type InvoiceFacts, type Money, type PaymentFacts, type ReceiptMode } from "@korra/core";
import { field, missing, parseAmount, parseCurrency, parseDate, parseRate } from "./normalize";
import { LLM_MIME, sniff } from "./sniff";
import { IngestError, type IngestDoc, type IngestResult, type IssuerFacts, type LlmExtractor } from "./types";

/** Design doc §7.2 default. (Sonnet 5.5: no forced tool_choice, no sampling params, no thinking param.) */
export const DEFAULT_MODEL = "claude-sonnet-5-5";

/** Anthropic request limit is 32 MB; base64 inflates by 4/3. */
const MAX_BYTES = 24 * 1024 * 1024;

// ---------------------------------------------------------------------------
// Output schema. Sent to the API as a JSON schema (structured outputs) and used to validate
// the reply. Deliberately free of min/max/format keywords, which structured outputs do not
// support; ranges are enforced in code instead.
// ---------------------------------------------------------------------------

const textField = z.object({ value: z.string().nullable(), confidence: z.number() });
/** Amounts are decimal strings plus a currency; converted to integer minor units in code. */
const moneyField = z.object({
  amount: z.string().nullable(),
  currency: z.string().nullable(),
  confidence: z.number(),
});

const invoiceSchema = z.object({
  invoiceNo: textField,
  invoiceDate: textField,
  clientName: textField,
  clientAddress: textField,
  clientCountry: textField,
  amount: moneyField,
  netRealisableValue: moneyField,
  contractRef: textField,
  serviceDescription: textField,
  sacCode: textField,
});

const paymentSchema = z.object({
  receiptMode: textField,
  date: textField,
  foreignAmount: moneyField,
  inrCredited: moneyField,
  fxRate: textField,
  fees: moneyField,
  firaRef: textField,
  purposeCode: textField,
  payerName: textField,
  realisingBankName: textField,
});

/** The exporter who issued the invoice, for filling in their profile. */
const issuerSchema = z.object({
  legalName: textField,
  address: textField,
  gstin: textField,
  ifsc: textField,
  bankName: textField,
});

const outputSchema = z.object({
  kind: z.enum(["invoice", "fira", "noc", "statement", "unknown"]),
  invoices: z.array(invoiceSchema),
  payments: z.array(paymentSchema),
  issuer: issuerSchema.nullable(),
  nocRef: z
    .object({
      reference: z.string().nullable(),
      amount: z.string().nullable(),
      currency: z.string().nullable(),
      date: z.string().nullable(),
    })
    .nullable(),
  warnings: z.array(z.string()),
});

type Output = z.infer<typeof outputSchema>;

const JSON_SCHEMA = (() => {
  const { $schema: _omit, ...schema } = z.toJSONSchema(outputSchema, { target: "draft-7" }) as Record<string, unknown>;
  void _omit;
  return schema;
})();

const SYSTEM_PROMPT = `You extract structured data from documents for an Indian service exporter who files EDF (Export Declaration Form) paperwork with their bank. Read the attached document and reply with JSON matching the provided schema. Never invent values: if something is not visible in the document, use null with confidence 0.

First classify the document ("kind"):
- "invoice": an export invoice the exporter issued to a foreign client (including Deel-generated invoice PDFs).
- "fira": a Foreign Inward Remittance Advice (or FIRC) issued by a bank for money received from abroad.
- "noc": a No Objection Certificate issued by a payment platform such as Deel, which the exporter's bank uses to issue a FIRC for a SWIFT payout.
- "statement": any other record of money received (for example a Deel withdrawal receipt or a payout statement).
- "unknown": anything else, or unreadable.

Rules for every field: give {value, confidence}. confidence is 0 to 1: 1.0 only when the text is clear and unambiguous, about 0.7 when you inferred or the scan is hard to read, 0 when value is null. Dates must be ISO YYYY-MM-DD. Money is given as {amount, currency, confidence}: amount is a plain decimal string with a dot as decimal separator and no thousands separators or symbols (for example "1234.56"), currency is the ISO 4217 code (for example "USD"). Put one invoice per entry of "invoices". Leave "invoices" and "payments" empty when they do not apply.

Invoice fields (kind "invoice"):
- invoiceNo, invoiceDate, contractRef (optional PO / contract / agreement reference).
- clientName, clientAddress (the full address of the foreign client), clientCountry as ISO 3166-1 alpha-2 code (for example "US", "GB"), derived from the client address.
- serviceDescription: what services were provided, short.
- sacCode: the GST SAC (Service Accounting Code), a 6-digit number starting with 99 (for example "998314"), if printed.
- amount: the invoice total in the invoice currency.
- netRealisableValue: the amount the exporter will actually realise, i.e. the invoice amount minus any deductions shown (withholding tax, platform fees, discounts). If the document shows no deductions, it equals amount.

Issuer (kind "invoice" only; for other kinds set "issuer" to null): the exporter who issued the invoice, the Indian service provider (the seller, never the client or a platform).
- legalName: their name or business name as printed. address: their full address as one line.
- gstin: their 15-character Indian GST number, if printed (never a foreign tax id or the client's). ifsc: the IFSC of their bank (4 letters, a zero, 6 characters) if bank details are printed. bankName: the name of their bank, if printed.

Payment fields (kind "fira", "statement"): one entry in "payments" per remittance.
- receiptMode: "swift" when foreign currency was remitted to a bank account (every FIRA is swift); "local_transfer" when a platform's Indian partner bank paid INR domestically; null if not clear.
- date: the credit / remittance date.
- foreignAmount: the amount in foreign currency; inrCredited: the INR credited; fxRate: INR per one unit of foreign currency, as a decimal string; fees: charges deducted, in the currency shown.
- firaRef: the FIRA / FIRC / inward remittance reference number. purposeCode: the RBI purpose code (format P followed by 4 digits, for example "P0802"). payerName: the remitter (the foreign client or platform that sent the money). realisingBankName: the bank that issued the advice / received the funds.

NOC fields (kind "noc"): fill "nocRef" with the NOC reference number, the amount and currency it covers, and its date. Leave "invoices" and "payments" empty. For other kinds set "nocRef" to null.

"warnings": short notes about anything a human should double-check (illegible parts, multiple currencies, missing pages). Do not copy document text into warnings beyond a few words.`;

// ---------------------------------------------------------------------------
// Conversion: model output -> IngestResult
// ---------------------------------------------------------------------------

const clamp01 = (n: number) => (Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);

function toText(f: z.infer<typeof textField>): Field<string> {
  const v = f.value?.trim();
  return v ? field(v, clamp01(f.confidence)) : missing();
}

function toMoney(f: z.infer<typeof moneyField>): Field<Money> {
  const cur = parseCurrency(f.currency ?? undefined);
  if (!f.amount || !cur) return missing();
  const p = parseAmount(f.amount, cur);
  return p ? field(p.value, Math.min(clamp01(f.confidence), p.confidence)) : missing();
}

function toDate(f: z.infer<typeof textField>): Field<string> {
  const p = f.value ? parseDate(f.value) : null;
  return p ? field(p.value, Math.min(clamp01(f.confidence), p.confidence)) : missing();
}

function toInvoice(i: Output["invoices"][number]): Omit<InvoiceFacts, "id" | "adBankId"> {
  const amount = toMoney(i.amount);
  let nrv = toMoney(i.netRealisableValue);
  if (nrv.value === null && amount.value !== null) {
    // Absent NRV means no deductions: it equals the amount. Flagged (below threshold) so it gets a look.
    nrv = { value: amount.value, confidence: 0.7, source: "default" };
  }
  const country = i.clientCountry.value?.trim().toUpperCase() ?? "";
  return {
    invoiceNo: toText(i.invoiceNo),
    invoiceDate: toDate(i.invoiceDate),
    clientName: toText(i.clientName),
    clientAddress: toText(i.clientAddress),
    clientCountry: /^[A-Z]{2}$/.test(country) ? field(country, clamp01(i.clientCountry.confidence)) : missing(),
    amount,
    netRealisableValue: nrv,
    inrEquivalent: { value: null, confidence: 0, source: "default" },
    contractRef: toText(i.contractRef),
    serviceDescription: toText(i.serviceDescription),
    sacCode: toText(i.sacCode),
  };
}

function toIssuer(i: NonNullable<Output["issuer"]>, sacCode: Field<string>): IssuerFacts {
  const g = i.gstin.value?.trim().toUpperCase() ?? "";
  const pan = panFromGstin(g);
  const ifsc = i.ifsc.value?.replace(/\s+/g, "").toUpperCase() ?? "";
  // The model's ids are checked against their formats, and the PAN is read off the GSTIN rather than trusted.
  return {
    legalName: toText(i.legalName),
    address: toText(i.address),
    gstin: GSTIN_RE.test(g) ? field(g, clamp01(i.gstin.confidence)) : missing(),
    pan: pan ? field(pan, clamp01(i.gstin.confidence)) : missing(),
    sacCode,
    ifsc: IFSC_RE.test(ifsc) ? field(ifsc, clamp01(i.ifsc.confidence)) : missing(),
    bankName: toText(i.bankName),
  };
}

function toPayment(p: Output["payments"][number], kind: Output["kind"]): Omit<PaymentFacts, "id"> {
  const modeText = p.receiptMode.value?.trim().toLowerCase().replace(/[\s-]+/g, "_");
  const mode: ReceiptMode | null = modeText === "swift" ? "swift" : modeText === "local_transfer" ? "local_transfer" : null;
  let receiptMode: Field<ReceiptMode> = mode ? field(mode, clamp01(p.receiptMode.confidence)) : missing();
  if (receiptMode.value === null && kind === "fira") {
    // A FIRA only exists for a foreign-currency remittance to the exporter's bank.
    receiptMode = { value: "swift", confidence: 0.9, source: "default" };
  }
  const rate = p.fxRate.value ? parseRate(p.fxRate.value) : null;
  return {
    // The LLM cannot tell which rail produced a payment; backend keeps the existing payment's rail when merging a FIRA.
    rail: "generic",
    receiptMode,
    date: toDate(p.date),
    foreignAmount: toMoney(p.foreignAmount),
    inrCredited: toMoney(p.inrCredited),
    fxRate: rate ? field(rate, clamp01(p.fxRate.confidence)) : missing(),
    fees: toMoney(p.fees),
    firaRef: toText(p.firaRef),
    purposeCode: toText(p.purposeCode),
    payerName: toText(p.payerName),
    realisingBankName: toText(p.realisingBankName),
  };
}

function convert(out: Output): IngestResult {
  const warnings = out.warnings.map((w) => w.slice(0, 300));
  if (out.kind === "noc") {
    const n = out.nocRef;
    const cur = parseCurrency(n?.currency ?? undefined);
    const amt = n?.amount && cur ? parseAmount(n.amount, cur) : null;
    const date = n?.date ? parseDate(n.date) : null;
    if (!n) warnings.push("NOC detected but no reference details could be read.");
    return {
      kind: "noc",
      nocRef: { reference: n?.reference?.trim() || null, amount: amt?.value ?? null, date: date?.value ?? null },
      rail: null,
      invoices: [],
      payments: [],
      warnings,
    };
  }
  const first = out.invoices[0];
  return {
    kind: out.kind,
    rail: null,
    invoices: out.kind === "unknown" ? [] : out.invoices.map(toInvoice),
    payments: out.kind === "unknown" ? [] : out.payments.map((p) => toPayment(p, out.kind)),
    ...(out.kind === "invoice" && out.issuer && { issuer: toIssuer(out.issuer, first ? toText(first.sacCode) : missing()) }),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Extractor
// ---------------------------------------------------------------------------

export interface ClaudeExtractorOptions {
  apiKey: string;
  model?: string;
  /** Test seam: inject a client double. Production code leaves this unset. */
  client?: Pick<Anthropic, "messages">;
}

function mapApiError(err: unknown): IngestError {
  // Messages are deliberately generic: never echo request content.
  if (err instanceof Anthropic.APIConnectionError) {
    return new IngestError("Could not reach the extraction service.", { retryable: true, code: "connection", cause: err });
  }
  if (err instanceof Anthropic.APIError) {
    const s = err.status ?? 0;
    const retryable = s === 408 || s === 409 || s === 429 || s >= 500;
    return new IngestError(`Extraction service error (HTTP ${s}).`, { retryable, code: `http_${s}`, cause: err });
  }
  return new IngestError("Unexpected extraction failure.", { retryable: false, code: "unexpected", cause: err });
}

export function createClaudeExtractor(opts: ClaudeExtractorOptions): LlmExtractor {
  const model = opts.model ?? DEFAULT_MODEL;
  // maxRetries (SDK default 2) already covers transient 429/5xx; IngestError.retryable is for the job sweeper.
  const client = opts.client ?? new Anthropic({ apiKey: opts.apiKey });

  return {
    async extract(doc: IngestDoc): Promise<IngestResult> {
      // Kill switch (design Q4 / ADR-0001). Read per call so it can be flipped without a restart.
      // It lives here, not in createIngester, because this is the only code that sends documents off-box.
      if (process.env.KORRA_LLM_ENABLED?.trim().toLowerCase() === "false") {
        return {
          kind: "unknown",
          rail: null,
          invoices: [],
          payments: [],
          warnings: ["Automatic extraction is disabled (KORRA_LLM_ENABLED=false). Enter the details manually."],
        };
      }

      const sniffed = sniff(doc.bytes, doc.mimeType, doc.filename);
      const mediaType = LLM_MIME[sniffed];
      if (!mediaType) throw new IngestError("File type not supported for extraction.", { retryable: false, code: "unsupported_type" });
      if (doc.bytes.byteLength > MAX_BYTES) {
        throw new IngestError("File is too large for extraction.", { retryable: false, code: "too_large" });
      }

      const data = Buffer.from(doc.bytes).toString("base64");
      const source =
        mediaType === "application/pdf"
          ? ({ type: "document", source: { type: "base64", media_type: mediaType, data } } as const)
          : ({ type: "image", source: { type: "base64", media_type: mediaType, data } } as const);
      const hint = doc.hint ? `\nThe uploader says this is probably a document of kind "${doc.hint}"; verify against the content.` : "";

      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          model,
          max_tokens: 16000,
          system: SYSTEM_PROMPT,
          messages: [
            { role: "user", content: [source, { type: "text", text: `Extract the data from this document.${hint}` }] },
          ],
          output_config: { format: { type: "json_schema", schema: JSON_SCHEMA } },
        });
      } catch (err) {
        throw mapApiError(err);
      }

      if (response.stop_reason === "refusal") {
        throw new IngestError("The extraction service declined to process this document.", { retryable: false, code: "refusal" });
      }
      if (response.stop_reason === "max_tokens") {
        throw new IngestError("Extraction output was cut off.", { retryable: false, code: "max_tokens" });
      }
      const text = response.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text;
      let parsed: Output;
      try {
        parsed = outputSchema.parse(JSON.parse(text ?? ""));
      } catch {
        throw new IngestError("Extraction returned an unreadable result.", { retryable: true, code: "bad_output" });
      }
      return convert(parsed);
    },
  };
}
