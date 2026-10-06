import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { money } from "@korra/core";
import {
  createFakeExtractor,
  createIngester,
  type IngestDoc,
  type IngestResult,
} from "./index";

const fixture = (rel: string) =>
  new Uint8Array(readFileSync(fileURLToPath(new URL(`../fixtures/${rel}`, import.meta.url))));

const csvDoc = (text: string, filename = "data.csv"): IngestDoc => ({
  bytes: new TextEncoder().encode(text),
  mimeType: "text/csv",
  filename,
});

const emptyResult = (over: Partial<IngestResult>): IngestResult => ({
  kind: "unknown",
  rail: null,
  invoices: [],
  payments: [],
  warnings: [],
  ...over,
});

const ingester = (fixtures: Record<string, IngestResult> = {}) =>
  createIngester({ llm: createFakeExtractor(fixtures) });

const GEN_HEAD = "date,amount,currency\n";

describe("Deel rail", () => {
  it("parses local transfers and swift withdrawals, ignoring invoice rows", async () => {
    const res = await ingester().ingest({
      bytes: fixture("deel/synthetic-transactions.csv"),
      mimeType: "text/csv",
      filename: "synthetic-transactions.csv",
    });
    expect(res.kind).toBe("statement");
    expect(res.rail).toBe("deel");
    expect(res.invoices).toEqual([]);
    expect(res.payments).toHaveLength(3);
    expect(res.warnings.some((w) => /1 .*ignored/i.test(w))).toBe(true);

    const [local1, local2, swift] = res.payments;
    expect(local1!.rail).toBe("deel");
    expect(local1!.receiptMode).toMatchObject({ value: "local_transfer", confidence: 0.7 });
    expect(local1!.date).toMatchObject({ value: "2026-09-05", confidence: 1 });
    expect(local1!.foreignAmount.value).toEqual(money(150000n, "USD"));
    expect(local1!.inrCredited.value).toEqual(money(12425000n, "INR"));
    expect(local1!.fxRate.value).toBe("83.50");
    expect(local1!.fees.value).toEqual(money(500n, "USD"));
    expect(local1!.firaRef.value).toBeNull();
    expect(local1!.payerName.value).toBe("Acme Corp");
    expect(local2!.foreignAmount.value).toEqual(money(80000n, "USD"));

    expect(swift!.receiptMode).toMatchObject({ value: "swift", confidence: 0.7 });
    expect(swift!.foreignAmount.value).toEqual(money(200000n, "USD"));
    expect(swift!.inrCredited).toMatchObject({ value: null, confidence: 0 });
    expect(swift!.firaRef).toMatchObject({ value: null, confidence: 0 });
  });

  it("infers local_transfer from an INR received currency when no method column exists", async () => {
    const res = await ingester().ingest(
      csvDoc(
        "Date,Type,Amount,Currency,Received Amount,Received Currency\n" +
          "2026-09-05,Withdrawal,100.00,USD,8300.00,INR\n" +
          "2026-09-06,Withdrawal,100.00,USD,,\n",
      ),
    );
    expect(res.rail).toBe("deel");
    expect(res.payments[0]!.receiptMode.value).toBe("local_transfer");
    expect(res.payments[0]!.inrCredited.value).toEqual(money(830000n, "INR"));
    expect(res.payments[1]!.receiptMode).toMatchObject({ value: null, confidence: 0 });
  });

  it("matches header aliases regardless of case, spaces and underscores", async () => {
    const res = await ingester().ingest(
      csvDoc(
        "COMPLETED_AT,transaction type,withdrawal amount,amount currency,payout method\n" +
          "2026-09-05,Payout,250.00,EUR,International wire\n",
      ),
    );
    expect(res.rail).toBe("deel");
    expect(res.payments[0]!.foreignAmount.value).toEqual(money(25000n, "EUR"));
    expect(res.payments[0]!.receiptMode.value).toBe("swift");
  });

  it("warns instead of throwing when columns are missing", async () => {
    const res = await ingester().ingest(
      csvDoc("Date,Type,Amount,Withdrawal Method\n2026-09-05,Withdrawal,100.00,SWIFT\n"),
    );
    expect(res.rail).toBe("deel");
    expect(res.payments).toHaveLength(1);
    expect(res.payments[0]!.foreignAmount).toMatchObject({ value: null, confidence: 0 });
    expect(res.warnings.some((w) => /currency/i.test(w))).toBe(true);
  });
});

describe("generic CSV rail", () => {
  it("parses the documented template", async () => {
    const res = await ingester().ingest({
      bytes: fixture("generic/sample.csv"),
      mimeType: "text/csv",
      filename: "sample.csv",
    });
    expect(res.kind).toBe("statement");
    expect(res.rail).toBe("generic");
    expect(res.payments).toHaveLength(2);
    const [a, b] = res.payments;
    expect(a!.rail).toBe("generic");
    expect(a!.receiptMode).toMatchObject({ value: "local_transfer", confidence: 1 });
    expect(a!.inrCredited.value).toEqual(money(20875000n, "INR"));
    expect(a!.fees.value).toEqual(money(1000n, "USD"));
    expect(a!.realisingBankName.value).toBe("Partner Bank");
    expect(b!.receiptMode.value).toBe("swift");
    expect(b!.firaRef.value).toBe("FIRA/SYN/0042");
    expect(b!.purposeCode.value).toBe("P0802");
    expect(b!.foreignAmount.value).toEqual(money(120000n, "EUR"));
    expect(b!.inrCredited.value).toBeNull();
  });

  it("returns unknown with a warning listing headers when nothing is recognised", async () => {
    const res = await ingester().ingest(csvDoc("foo,bar\n1,2\n"));
    expect(res.kind).toBe("unknown");
    expect(res.rail).toBeNull();
    expect(res.warnings.join(" ")).toMatch(/foo/);
    expect(res.warnings.join(" ")).toMatch(/bar/);
  });
});

describe("amount parsing", () => {
  const amountOf = async (raw: string, currency = "USD") => {
    const res = await ingester().ingest(csvDoc(`${GEN_HEAD}2026-09-01,"${raw}",${currency}\n`));
    return res.payments[0]!.foreignAmount;
  };

  it("parses thousands separators and symbols exactly", async () => {
    expect(await amountOf("1,234.56")).toEqual({
      value: money(123456n, "USD"),
      confidence: 1,
      source: "extracted",
    });
    expect((await amountOf("$1,234.56")).value).toEqual(money(123456n, "USD"));
    expect((await amountOf("1234")).value).toEqual(money(123400n, "USD"));
    expect((await amountOf("0.5")).value).toEqual(money(50n, "USD"));
    expect((await amountOf("-10.00")).value).toEqual(money(-1000n, "USD"));
  });

  it("uses zero-decimal currencies", async () => {
    expect((await amountOf("¥1,500", "JPY")).value).toEqual(money(1500n, "JPY"));
  });

  it("accepts European formatting with reduced confidence", async () => {
    const f = await amountOf("1.234,56");
    expect(f.value).toEqual(money(123456n, "USD"));
    expect(f.confidence).toBe(0.7);
  });

  it("flags a lone-comma amount as ambiguous", async () => {
    const f = await amountOf("12,50");
    expect(f.value).toEqual(money(1250n, "USD"));
    expect(f.confidence).toBe(0.7);
  });

  it("yields null/0 for unparseable or empty amounts, with a warning", async () => {
    const res = await ingester().ingest(csvDoc(`${GEN_HEAD}2026-09-01,abc,USD\n`));
    expect(res.payments[0]!.foreignAmount).toMatchObject({ value: null, confidence: 0 });
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});

describe("date parsing", () => {
  const dateOf = async (raw: string) => {
    const res = await ingester().ingest(csvDoc(`${GEN_HEAD}"${raw}",10.00,USD\n`));
    return res.payments[0]!.date;
  };

  it("parses ISO exactly", async () => {
    expect(await dateOf("2026-10-03")).toMatchObject({ value: "2026-10-03", confidence: 1 });
    expect(await dateOf("2026-10-03T12:30:00Z")).toMatchObject({ value: "2026-10-03", confidence: 1 });
  });

  it("parses unambiguous slash dates exactly", async () => {
    expect(await dateOf("25/10/2026")).toMatchObject({ value: "2026-10-25", confidence: 1 });
    expect(await dateOf("10/25/2026")).toMatchObject({ value: "2026-10-25", confidence: 1 });
  });

  it("reads ambiguous dates as DD/MM and flags them", async () => {
    expect(await dateOf("03/10/2026")).toMatchObject({ value: "2026-10-03", confidence: 0.7 });
  });

  it("parses month-name dates", async () => {
    expect(await dateOf("Oct 3, 2026")).toMatchObject({ value: "2026-10-03", confidence: 1 });
    expect(await dateOf("3 October 2026")).toMatchObject({ value: "2026-10-03", confidence: 1 });
  });

  it("rejects impossible dates", async () => {
    expect(await dateOf("31/02/2026")).toMatchObject({ value: null, confidence: 0 });
  });
});

describe("routing", () => {
  it("sends PDFs to the LLM extractor, keyed by filename", async () => {
    const canned = emptyResult({ kind: "fira", warnings: ["from fake"] });
    const res = await ingester({ "fira.pdf": canned }).ingest({
      bytes: new TextEncoder().encode("%PDF-1.7 fake"),
      mimeType: "application/pdf",
      filename: "fira.pdf",
    });
    expect(res).toEqual(canned);
  });

  it("sends images to the LLM extractor (by magic bytes, even if mime lies)", async () => {
    const canned = emptyResult({ kind: "invoice" });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
    const res = await ingester({ "scan.png": canned }).ingest({
      bytes: png,
      mimeType: "application/octet-stream",
      filename: "scan.png",
    });
    expect(res.kind).toBe("invoice");
  });

  it("passes NOC results through unchanged", async () => {
    const noc = emptyResult({
      kind: "noc",
      nocRef: { reference: "NOC-1", amount: money(100000n, "USD"), date: "2026-09-20" },
    });
    const res = await ingester({ "noc.pdf": noc }).ingest({
      bytes: new TextEncoder().encode("%PDF-1.4"),
      mimeType: "application/pdf",
      filename: "noc.pdf",
    });
    expect(res.kind).toBe("noc");
    expect(res.nocRef?.reference).toBe("NOC-1");
    expect(res.invoices).toEqual([]);
    expect(res.payments).toEqual([]);
  });

  it("returns unknown for an unfamiliar PDF filename in the fake", async () => {
    const res = await ingester().ingest({
      bytes: new TextEncoder().encode("%PDF-1.4"),
      mimeType: "application/pdf",
      filename: "mystery.pdf",
    });
    expect(res.kind).toBe("unknown");
  });

  it("returns unknown + warning for unsupported file types without throwing", async () => {
    const res = await ingester().ingest({
      bytes: new TextEncoder().encode("hello"),
      mimeType: "application/zip",
      filename: "stuff.zip",
    });
    expect(res.kind).toBe("unknown");
    expect(res.warnings.length).toBeGreaterThan(0);
  });
});

describe("XLSX", () => {
  it("reads the first sheet and converts date cells", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("Payments");
    ws.addRow(["date", "amount", "currency", "payer"]);
    ws.addRow([new Date(Date.UTC(2026, 8, 10)), 2500.5, "USD", "Acme Corp"]);
    ws.addRow(["2026-09-11", "1,000.00", "USD", "Globex"]);
    wb.addWorksheet("Other").addRow(["ignored"]);
    const buf = new Uint8Array(await wb.xlsx.writeBuffer());

    const res = await ingester().ingest({
      bytes: buf,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      filename: "payments.xlsx",
    });
    expect(res.rail).toBe("generic");
    expect(res.payments).toHaveLength(2);
    expect(res.payments[0]!.date.value).toBe("2026-09-10");
    expect(res.payments[0]!.foreignAmount.value).toEqual(money(250050n, "USD"));
    expect(res.payments[1]!.foreignAmount.value).toEqual(money(100000n, "USD"));
    expect(res.payments[1]!.payerName.value).toBe("Globex");
  });
});
