import { describe, expect, it } from "vitest";
import { FLAG_THRESHOLD, money, type Field } from "@korra/core";
import { createIngester } from "./index";
import { createLocalPdfExtractor, extractFromText, LOCAL_CONFIDENCE, SCANNED_WARNING } from "./pdf";

const PDF = new TextEncoder().encode("%PDF-1.4 fake");
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]);

const INVOICE = [
  "JANE DEV CONSULTING",
  "12 MG Road, Bengaluru 560001, India",
  "GSTIN: 29ABCDE1234F1Z5",
  "TAX INVOICE",
  "Invoice No: INV-2026-014",
  "Invoice Date: 02 Sep 2026",
  "Due Date: 02 Oct 2026",
  "Bill To:",
  "Acme Corp",
  "1 Main Street",
  "New York, NY 10001",
  "United States",
  "Description Qty Rate Amount",
  "Software development services - September 2026 1 $1,500.00 $1,500.00",
  "SAC: 998314",
  "Subtotal $1,500.00",
  "Total Due USD 1,500.00",
];

const DEEL = [
  "Invoice",
  "Invoice number",
  "DEEL-7781234",
  "Date of issue",
  "5 October 2026",
  "Billed to: Globex GmbH",
  "Friedrichstrasse 12",
  "10117 Berlin",
  "Germany",
  "Description Hours Rate Total",
  "Contract work - Frontend engineering 80 € 50.00 € 4,000.00",
  "Subtotal € 4,000.00",
  "Total amount € 4,000.00",
  "HSN/SAC 998313",
];

const FIRA = [
  "HDFC Bank Limited",
  "Foreign Inward Remittance Advice (FIRA)",
  "FIRA No: HDFC/FIRA/2026/55231",
  "Date of credit: 21/09/2026",
  "Name of Remitter: Acme Corp",
  "Purpose Code: P0802",
  "Foreign currency amount: USD 2,000.00",
  "Exchange rate: 83.4500",
  "Amount in INR: INR 1,66,900.00",
];

const NOC = [
  "TO WHOM IT MAY CONCERN",
  "No Objection Certificate",
  "Reference No: NOC-2026-0099",
  "We have no objection to the foreign inward remittance of USD 2,000.00 received on 21/09/2026.",
  "Amount: USD 2,000.00",
];

const doc = (name: string, bytes = PDF, hint?: "invoice" | "fira" | "noc") => ({ bytes, mimeType: "application/pdf", filename: name, ...(hint ? { hint } : {}) });
const extractor = (lines: string[]) => createLocalPdfExtractor({ getTextLayer: async () => lines });
const fields = (o: object) => Object.values(o).filter((v): v is Field<unknown> => typeof v === "object" && v !== null && "confidence" in v && "source" in v);

describe("local PDF extractor", () => {
  it("reads an invoice", async () => {
    const r = await extractor(INVOICE).extract(doc("inv.pdf"));
    expect(r.kind).toBe("invoice");
    const inv = r.invoices[0]!;
    expect(inv.invoiceNo.value).toBe("INV-2026-014");
    expect(inv.invoiceDate.value).toBe("2026-09-02");
    expect(inv.amount.value).toEqual(money(150000, "USD"));
    expect(inv.netRealisableValue.value).toEqual(money(150000, "USD"));
    expect(inv.clientName.value).toBe("Acme Corp");
    expect(inv.clientCountry.value).toBe("US");
    expect(inv.sacCode.value).toBe("998314");
    expect(inv.serviceDescription.value).toBe("Software development services - September 2026");
  });

  it("reads a Deel-generated invoice (values on the next line, euro symbol, month names)", async () => {
    const inv = (await extractor(DEEL).extract(doc("deel.pdf"))).invoices[0]!;
    expect(inv.invoiceNo.value).toBe("DEEL-7781234");
    expect(inv.invoiceDate.value).toBe("2026-10-05");
    expect(inv.clientName.value).toBe("Globex GmbH");
    expect(inv.clientCountry.value).toBe("DE");
    expect(inv.amount.value).toEqual(money(400000, "EUR"));
    expect(inv.sacCode.value).toBe("998313");
    expect(inv.serviceDescription.value).toBe("Contract work - Frontend engineering");
  });

  it("reads a FIRA", async () => {
    const r = await extractor(FIRA).extract(doc("fira.pdf"));
    expect(r.kind).toBe("fira");
    expect(r.invoices).toEqual([]);
    const p = r.payments[0]!;
    expect(p.firaRef.value).toBe("HDFC/FIRA/2026/55231");
    expect(p.purposeCode.value).toBe("P0802");
    expect(p.foreignAmount.value).toEqual(money(200000, "USD"));
    expect(p.inrCredited.value).toEqual(money(16690000, "INR"));
    expect(p.fxRate.value).toBe("83.4500");
    expect(p.date.value).toBe("2026-09-21");
    expect(p.payerName.value).toBe("Acme Corp");
    expect(p.receiptMode.value).toBe("swift");
    expect(p.realisingBankName.value).toBe("HDFC Bank Limited");
  });

  it("reads a NOC (a NOC mentioning the remittance is still a NOC)", async () => {
    const r = await extractor(NOC).extract(doc("noc.pdf"));
    expect(r.kind).toBe("noc");
    expect(r.nocRef).toEqual({ reference: "NOC-2026-0099", amount: money(200000, "USD"), date: "2026-09-21" });
    expect(r.invoices).toEqual([]);
    expect(r.payments).toEqual([]);
  });

  it("gives EVERY extracted value confidence 0.6 (below the flag threshold) and source 'extracted'", async () => {
    expect(LOCAL_CONFIDENCE).toBeLessThan(FLAG_THRESHOLD);
    for (const lines of [INVOICE, DEEL, FIRA]) {
      const r = await extractor(lines).extract(doc("x.pdf"));
      const all = [...r.invoices, ...r.payments].flatMap(fields);
      expect(all.length).toBeGreaterThan(0);
      for (const fld of all) {
        if (fld.value === null) continue;
        if (fld.source === "default") continue; // inrEquivalent: not extracted at all
        expect(fld).toMatchObject({ confidence: 0.6, source: "extracted" });
      }
    }
  });

  it("images -> unknown with the by-hand warning, and a PDF with no text layer is treated as scanned", async () => {
    const png = await extractor(INVOICE).extract({ bytes: PNG, mimeType: "image/png", filename: "scan.png" });
    expect(png).toMatchObject({ kind: "unknown", invoices: [], payments: [], warnings: [SCANNED_WARNING] });
    const scanned = await extractor([]).extract(doc("scan.pdf"));
    expect(scanned).toMatchObject({ kind: "unknown", warnings: [SCANNED_WARNING] });
  });

  it("honours the upload hint when the text is ambiguous", () => {
    expect(extractFromText(["Some document with a total", "Total 10.00 USD", "Invoice No 7"], "fira").kind).toBe("fira");
  });

  it("parses other date formats and symbols", () => {
    const r = extractFromText(["Invoice #: A-100", "Date: 2026-10-03", "Client: Initech Ltd", "London, United Kingdom", "Total £ 2,500.50"]);
    const inv = r.invoices[0]!;
    expect(inv.invoiceDate.value).toBe("2026-10-03");
    expect(inv.amount.value).toEqual(money(250050, "GBP"));
    expect(inv.clientName.value).toBe("Initech Ltd");
    expect(inv.clientCountry.value).toBe("GB");
    expect(extractFromText(["Invoice No: Z9", "Dated: 15/10/2026", "Total: AUD 100"]).invoices[0]!.invoiceDate.value).toBe("2026-10-15");
    expect(extractFromText(["Invoice No: Z9", "Date: October 3rd, 2026", "Total: AUD 100"]).invoices[0]!.invoiceDate.value).toBe("2026-10-03");
  });

  it("leaves unfound fields null with a warning instead of guessing", () => {
    const r = extractFromText(["Random letter from a vendor with no figures at all in it, really none"]);
    expect(r.kind).toBe("invoice");
    const inv = r.invoices[0]!;
    expect(inv.invoiceNo.value).toBeNull();
    expect(inv.amount.value).toBeNull();
    expect(r.warnings.join(" ")).toMatch(/invoice total/);
  });

  it("plugs into createIngester as the pdf/image extractor", async () => {
    const ingester = createIngester({ llm: extractor(INVOICE) });
    const r = await ingester.ingest(doc("inv.pdf"));
    expect(r.kind).toBe("invoice");
    const img = await ingester.ingest({ bytes: PNG, mimeType: "image/png", filename: "a.png" });
    expect(img.kind).toBe("unknown");
  });
});

describe("local rules: the issuer (exporter) of an invoice", () => {
  const issuer = (lines: string[]) => extractFromText(lines, "invoice").issuer!;
  const values = (i: ReturnType<typeof issuer>) => Object.fromEntries(Object.entries(i).map(([k, v]) => [k, v.value]));

  it("reads the header block, the GSTIN, the PAN inside it and the SAC", () => {
    expect(values(issuer(INVOICE))).toEqual({
      legalName: "JANE DEV CONSULTING", address: "12 MG Road, Bengaluru 560001, India", gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F",
      sacCode: "998314", ifsc: null, bankName: null,
    });
  });

  it("reads a labelled From block, a printed PAN, the bank name and the IFSC", () => {
    const i = issuer([
      "Tax Invoice",
      "Invoice No: INV-9",
      "From:",
      "Jane Dev Consulting Pvt Ltd",
      "12 MG Road",
      "Bengaluru, Karnataka 560001",
      "India",
      "GSTIN: 29ABCDE1234F1Z5",
      "PAN: ABCDE1234F",
      "Bill To:",
      "Acme Corp",
      "Austin, TX 78701, United States",
      "Total USD 1,500.00",
      "Bank Name: HDFC Bank Ltd. A/c No 50100123456789",
      "IFSC Code: HDFC0001234",
    ]);
    expect(values(i)).toMatchObject({
      legalName: "Jane Dev Consulting Pvt Ltd", address: "12 MG Road, Bengaluru, Karnataka 560001, India",
      gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F", ifsc: "HDFC0001234", bankName: "HDFC Bank Ltd.",
    });
  });

  it("cuts a name at the invoice facts printed on the same line", () => {
    const i = issuer(["Jane Dev Consulting Invoice No: INV-1", "12 MG Road, Pune India Invoice Date: 02 Sep 2026", "GSTIN: 27ABCDE1234F1Z5", "Bill To:", "Acme Corp"]);
    expect(values(i)).toMatchObject({ legalName: "Jane Dev Consulting", address: "12 MG Road, Pune India", gstin: "27ABCDE1234F1Z5", pan: "ABCDE1234F" });
  });

  it("maps a lone IFSC of a known bank, but ignores one from an unknown bank unless it is labelled", () => {
    expect(issuer(["Pay to ICIC0000123 Mumbai", "Invoice No: 1"]).ifsc.value).toBe("ICIC0000123");
    expect(issuer(["Pay to FDRL0001234 Kochi", "Invoice No: 1"]).ifsc.value).toBeNull();
    expect(issuer(["IFSC: FDRL0001234", "Invoice No: 1"]).ifsc.value).toBe("FDRL0001234");
  });

  it("finds nothing, and invents nothing, without an anchor, or when the top block is foreign", () => {
    expect(values(issuer(DEEL))).toEqual({ legalName: null, address: null, gstin: null, pan: null, sacCode: "998313", ifsc: null, bankName: null });
    expect(values(issuer(["Random letter from a vendor with no figures at all in it, really none"]))).toMatchObject({ legalName: null, address: null, gstin: null, pan: null });
    const foreign = issuer(["Deel Inc.", "650 California St, San Francisco, CA 94108, United States", "GSTIN: 29ABCDE1234F1Z5", "Invoice No: 1"]);
    expect(values(foreign)).toMatchObject({ legalName: null, address: null, gstin: "29ABCDE1234F1Z5", pan: "ABCDE1234F" });
  });

  it("gives every value the local confidence, and a scan or an image has no issuer", async () => {
    for (const v of Object.values(issuer(INVOICE))) if (v.value !== null) expect(v).toMatchObject({ confidence: LOCAL_CONFIDENCE, source: "extracted" });
    expect(extractFromText([]).issuer).toBeUndefined();
    expect((await extractor(INVOICE).extract({ bytes: PNG, mimeType: "image/png", filename: "scan.png" })).issuer).toBeUndefined();
  });
});
