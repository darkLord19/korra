import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { money, type DeclarationRow, type ReadyDeclaration } from "@korra/core";
import { LayoutNotFoundError, listLayouts, renderDeclaration, renderPack } from "./index";
import { getDeclarationLayout } from "./layouts";

function row(i: number, over: Partial<DeclarationRow> = {}): DeclarationRow {
  return {
    invoiceId: `i${i}`,
    invoiceNo: `INV-${i}`,
    invoiceDate: "2026-10-05",
    edfMonth: "2026-10",
    clientName: `Client ${i}`,
    currency: "USD",
    invoiceAmount: money(123456 + i, "USD"),
    inrEquivalent: money(10_000_000 + i, "INR"),
    realisedAmount: money(123456 + i, "USD"),
    status: "realised_in_full",
    evidence: { paymentDates: "2026-11-10", references: "Deel withdrawal 2026-11-10", receiptModes: "Local transfer" },
    ...over,
  };
}

/** Test-only: ReadyDeclaration can only be built by core's assessDeclaration. */
function ready(rows: DeclarationRow[], bankName = "ICICI Bank"): ReadyDeclaration {
  return {
    period: "2026-Q4",
    periodLabel: "Oct–Dec 2026 (Q3 FY 2026-27)",
    adBank: { id: "b1", name: bankName, adCode: "6390001" },
    exporter: {
      legalName: "Acme Consulting LLP",
      address: "12 MG Road, Bengaluru",
      pan: "ABCDE1234F",
      gstin: "29ABCDE1234F1Z5",
      iec: null,
      defaultSacCodes: [],
      defaultAdBankId: "b1",
    },
    rows,
    warnings: [],
    generatedAt: "2027-01-05T00:00:00.000Z",
  } as unknown as ReadyDeclaration;
}

/** True when the PDF draws `needle` (ASCII) in one text-show operation: pdf-lib writes standard-font text as hex in Flate streams. */
async function pdfDraws(bytes: Uint8Array, needle: string): Promise<boolean> {
  const doc = await PDFDocument.load(bytes);
  const hex = [...needle].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").toUpperCase();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    if (Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1").toUpperCase().includes(hex)) return true;
  }
  return false;
}

const file = (r: Awaited<ReturnType<typeof renderDeclaration>>, ext: string) => {
  const f = r.files.find((x) => x.name.endsWith(ext));
  if (!f) throw new Error(`no ${ext}`);
  return f;
};

describe("renderDeclaration", () => {
  it("lists declaration layouts separately from EDF layouts", () => {
    const d = listLayouts("declaration");
    expect(d.map((x) => x.id).sort()).toEqual([
      "declaration-axis",
      "declaration-generic",
      "declaration-hdfc",
      "declaration-icici",
    ]);
    expect(d.find((x) => x.id === "declaration-generic")).toMatchObject({ placeholder: false, version: "1" });
    for (const id of ["icici", "hdfc", "axis"]) {
      expect(d.find((x) => x.id === `declaration-${id}`)).toMatchObject({ placeholder: true, version: "0" });
    }
    expect(listLayouts().map((x) => x.id).sort()).toEqual(["axis", "generic", "hdfc", "icici"]);
    expect(listLayouts("edf")).toEqual(listLayouts());
  });

  it("keeps the kinds apart", async () => {
    await expect(renderDeclaration(ready([row(1)]), "generic")).rejects.toBeInstanceOf(LayoutNotFoundError);
    await expect(renderDeclaration(ready([row(1)]), "nope")).rejects.toBeInstanceOf(LayoutNotFoundError);
    await expect(renderPack(ready([row(1)]) as never, "declaration-generic", [])).rejects.toBeInstanceOf(
      LayoutNotFoundError,
    );
  });

  it("names files deterministically", async () => {
    const r = await renderDeclaration(ready([row(1)]), "declaration-icici");
    expect(r.files.map((f) => f.name)).toEqual([
      "DECLARATION-icici-bank-2026-Q4.pdf",
      "DECLARATION-icici-bank-2026-Q4.xlsx",
      "HOW-TO-SUBMIT-DECLARATION-icici-bank.md",
    ]);
  });

  it("names single-invoice declarations by invoice number", async () => {
    const d = { ...ready([row(7, { invoiceNo: "INV/2026 07" })]), period: { invoiceId: "i7" } } as ReadyDeclaration;
    const r = await renderDeclaration(d, "declaration-generic");
    expect(r.files[0]?.name).toBe("DECLARATION-icici-bank-invoice-inv-2026-07.pdf");
  });

  it("writes xlsx with headers in layout order and values", async () => {
    const rows = [row(1), row(2, { status: "partly_realised_reduction", realisedAmount: money(1000, "USD") })];
    const r = await renderDeclaration(ready(rows), "declaration-generic");
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file(r, ".xlsx").bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Declaration")!;
    const layout = getDeclarationLayout("declaration-generic");
    expect((ws.getRow(1).values as unknown[]).slice(1)).toEqual(layout.columns.map((c) => c.header));
    expect(ws.rowCount).toBe(3);
    const col = (h: string) => layout.columns.findIndex((c) => c.header === h) + 1;
    const r2 = ws.getRow(2);
    expect(r2.getCell(col("Invoice no")).value).toBe("INV-1");
    expect(r2.getCell(col("Invoice amount")).value).toBe(1234.57);
    expect(r2.getCell(col("INR equivalent")).value).toBe(100000.01);
    expect(r2.getCell(col("Currency")).value).toBe("USD");
    expect(r2.getCell(col("Status")).value).toBe("Realised in full");
    expect(r2.getCell(col("Payment reference(s)")).value).toBe("Deel withdrawal 2026-11-10");
    expect(r2.getCell(col("Receipt mode")).value).toBe("Local transfer");
    expect(((r2.getCell(col("Invoice date")).value) as Date).toISOString().slice(0, 10)).toBe("2026-10-05");
    const r3 = ws.getRow(3);
    expect(r3.getCell(col("Status")).value).toContain("reduction requested (Reg. 6)");
    expect(r3.getCell(col("Realised amount")).value).toBe(10);
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });

  it("draws a blank AD code line when the code is empty, and never 'undefined'", async () => {
    const d = ready([row(1)]);
    (d as { adBank: { adCode: string } }).adBank.adCode = "";
    const bytes = file(await renderDeclaration(d, "declaration-generic"), ".pdf").bytes;
    expect(await pdfDraws(bytes, "AD code: ____________")).toBe(true);
    expect(await pdfDraws(bytes, "undefined")).toBe(false);
    const withCode = file(await renderDeclaration(ready([row(1)]), "declaration-generic"), ".pdf").bytes;
    expect(await pdfDraws(withCode, "AD code: 6390001")).toBe(true);
  });

  it("renders an A4 pdf that paginates, with a footer, and survives non-Latin text", async () => {
    const small = await renderDeclaration(ready([row(1)]), "declaration-generic");
    const rows = Array.from({ length: 60 }, (_, i) =>
      row(i, i === 0 ? { clientName: "株式会社テスト ₹ Ünïcode" } : {}),
    );
    const big = await renderDeclaration(ready(rows), "declaration-icici");
    const p1 = await PDFDocument.load(file(small, ".pdf").bytes);
    const p60 = await PDFDocument.load(file(big, ".pdf").bytes);
    const { width, height } = p60.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
    expect(p1.getPageCount()).toBe(1);
    expect(p60.getPageCount()).toBeGreaterThan(1);
    expect(p60.getTitle()).toBe("Declaration for closure of EDPMS entries — export of services");
  });

  it("guide says the bank may close, never will; substitutes placeholders", async () => {
    const r = await renderDeclaration(ready([row(1)]), "declaration-icici");
    const md = new TextDecoder().decode(file(r, ".md").bytes);
    expect(md).toContain("ICICI Bank");
    expect(md).toContain("Oct–Dec 2026 (Q3 FY 2026-27)");
    expect(md).toContain("may close");
    expect(md).not.toMatch(/will close/i);
    expect(md).not.toMatch(/\{(bank|period)\}/);
    expect(md.toLowerCase()).toContain("unverified");
    expect(md.toLowerCase()).toContain("acknowledgement");
    const generic = new TextDecoder().decode(file(await renderDeclaration(ready([row(1)]), "declaration-generic"), ".md").bytes);
    expect(generic.toLowerCase()).not.toContain("unverified");
  });
});
