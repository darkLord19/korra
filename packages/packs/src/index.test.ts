import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFDocument, PDFRawStream, decodePDFRawStream } from "pdf-lib";
import { money, type EdfRow, type PackDraft, type ReadyPack } from "@korra/core";
import { LayoutNotFoundError, PACKAGE, listLayouts, renderPack } from "./index";
import { getLayout } from "./layouts";

function row(i: number, over: Partial<EdfRow> = {}): EdfRow {
  return {
    exporterLegalName: "Acme Consulting LLP",
    exporterAddress: "12 MG Road, Bengaluru 560001",
    exporterPan: "ABCDE1234F",
    exporterGstin: "29ABCDE1234F1Z5",
    exporterIec: null,
    invoiceNo: `INV-${i}`,
    invoiceDate: "2026-10-05",
    clientName: `Client ${i}`,
    clientAddress: "1 Main St, NYC",
    clientCountry: "US",
    invoiceAmount: money(123456 + i, "USD"),
    netRealisableValue: money(120000, "USD"),
    contractRef: null,
    serviceDescription: "Software development services rendered under the master services agreement",
    sacCode: "998314",
    ...over,
  };
}

/** Test-only: ReadyPack can only be built by core's assessPack, which is not available here. */
function asReadyPackForTest(rows: EdfRow[], bankName = "ICICI Bank"): ReadyPack {
  const draftLike = {
    month: "2026-10",
    adBank: { id: "b1", name: bankName, adCode: "6390001" },
    exporter: {
      legalName: "Acme",
      address: "x",
      pan: "P",
      gstin: "G",
      iec: null,
      defaultSacCodes: [],
      defaultAdBankId: "b1",
    },
    invoices: [],
    pendingDocumentIds: [],
    generatedAt: "2026-11-02T00:00:00.000Z",
    rows,
  } satisfies PackDraft & { generatedAt: string; rows: EdfRow[] };
  return draftLike as unknown as ReadyPack;
}

/**
 * True when the PDF draws `needle` (ASCII) in one text-show operation. pdf-lib writes standard-font
 * text as hex strings inside Flate-compressed content streams, so decode every stream and search hex.
 */
async function pdfDraws(bytes: Uint8Array, needle: string): Promise<boolean> {
  const doc = await PDFDocument.load(bytes);
  const hex = [...needle].map((c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("").toUpperCase();
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const text = Buffer.from(decodePDFRawStream(obj).decode()).toString("latin1").toUpperCase();
    if (text.includes(hex)) return true;
  }
  return false;
}

const file = (r: Awaited<ReturnType<typeof renderPack>>, ext: string) => {
  const f = r.files.find((x) => x.name.endsWith(ext));
  if (!f) throw new Error(`no ${ext}`);
  return f;
};

describe("@korra/packs", () => {
  it("loads", () => expect(PACKAGE).toBe("@korra/packs"));

  it("lists layouts", () => {
    const l = listLayouts();
    expect(l.map((x) => x.id).sort()).toEqual(["axis", "generic", "hdfc", "icici"]);
    expect(l.find((x) => x.id === "generic")).toMatchObject({ placeholder: false, version: "1" });
    expect(l.find((x) => x.id === "hdfc")).toMatchObject({ placeholder: false, version: "1" });
    for (const id of ["icici", "axis"]) {
      expect(l.find((x) => x.id === id)).toMatchObject({ placeholder: true, version: "0" });
    }
  });

  it("throws a typed error for unknown layouts", async () => {
    await expect(renderPack(asReadyPackForTest([row(1)]), "nope", [])).rejects.toBeInstanceOf(
      LayoutNotFoundError,
    );
  });

  it("names files deterministically", async () => {
    const r = await renderPack(asReadyPackForTest([row(1)], "ICICI Bank"), "icici", []);
    expect(r.files.map((f) => f.name)).toEqual([
      "EDF-icici-bank-2026-10.pdf",
      "EDF-icici-bank-2026-10.xlsx",
      "supporting-2026-10.zip",
      "HOW-TO-SUBMIT-icici-bank.md",
    ]);
  });

  it("writes xlsx with headers in layout order and typed values", async () => {
    const r = await renderPack(asReadyPackForTest([row(1), row(2)]), "generic", []);
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(file(r, ".xlsx").bytes as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("EDF")!;
    const layout = getLayout("generic");
    const headers = (ws.getRow(1).values as unknown[]).slice(1);
    expect(headers).toEqual(layout.columns.map((c) => c.header));
    expect(ws.rowCount).toBe(3);
    const col = (h: string) => layout.columns.findIndex((c) => c.header === h) + 1;
    const r2 = ws.getRow(2);
    expect(r2.getCell(col("Invoice no")).value).toBe("INV-1");
    expect(r2.getCell(col("Invoice amount")).value).toBe(1234.57);
    expect(r2.getCell(col("Currency")).value).toBe("USD");
    const d = r2.getCell(col("Invoice date")).value;
    expect(d).toBeInstanceOf(Date);
    expect((d as Date).toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(ws.views[0]).toMatchObject({ state: "frozen", ySplit: 1 });
  });

  it("draws a blank AD code line when the code is empty, and never 'undefined'", async () => {
    for (const layout of ["generic", "icici"]) {
      const pack = asReadyPackForTest([row(1)]);
      (pack as { adBank: { adCode: string } }).adBank.adCode = "";
      const bytes = file(await renderPack(pack, layout, []), ".pdf").bytes;
      expect(await pdfDraws(bytes, "AD code: ____________")).toBe(true);
      expect(await pdfDraws(bytes, "undefined")).toBe(false);
    }
    const withCode = file(await renderPack(asReadyPackForTest([row(1)]), "generic", []), ".pdf").bytes;
    expect(await pdfDraws(withCode, "AD code: 6390001")).toBe(true);
  });

  it("renders A4 pdf that paginates, and survives non-Latin text and rupee sign", async () => {
    const small = await renderPack(asReadyPackForTest([row(1)]), "generic", []);
    const rows = Array.from({ length: 60 }, (_, i) =>
      row(i, i === 0 ? { clientName: "株式会社テスト ₹ Ünïcode" } : {}),
    );
    const big = await renderPack(asReadyPackForTest(rows), "icici", []);
    const p1 = await PDFDocument.load(file(small, ".pdf").bytes);
    const p60 = await PDFDocument.load(file(big, ".pdf").bytes);
    const { width, height } = p60.getPage(0).getSize();
    expect(width).toBeCloseTo(595.28, 1);
    expect(height).toBeCloseTo(841.89, 1);
    expect(p1.getPageCount()).toBe(1);
    expect(p60.getPageCount()).toBeGreaterThan(p1.getPageCount());
  });

  it("zips supporting docs in deterministic order, deduping names", async () => {
    const b = (s: string) => new TextEncoder().encode(s);
    const docs = [
      { name: "b.pdf", bytes: b("1") },
      { name: "a.pdf", bytes: b("2") },
      { name: "b.pdf", bytes: b("3") },
    ];
    const pack = asReadyPackForTest([row(1)]);
    const z1 = file(await renderPack(pack, "generic", docs), ".zip").bytes;
    const zip = await JSZip.loadAsync(z1);
    expect(Object.keys(zip.files)).toEqual(["a.pdf", "b.pdf", "b-2.pdf"]);
    const z2 = file(await renderPack(pack, "generic", [...docs].reverse()), ".zip").bytes;
    expect(Object.keys((await JSZip.loadAsync(z2)).files)).toEqual(["a.pdf", "b.pdf", "b-2.pdf"]);
  });

  it("substitutes guide placeholders", async () => {
    const r = await renderPack(asReadyPackForTest([row(1)], "ICICI Bank"), "icici", []);
    const md = new TextDecoder().decode(file(r, ".md").bytes);
    expect(md).toContain("ICICI Bank");
    expect(md).toContain("October 2026");
    expect(md).toContain("2026-11-30");
    expect(md).not.toMatch(/\{(bank|month|dueDate)\}/);
    expect(md.toLowerCase()).toContain("unverified");
  });

  describe("hdfc layout (HDFC request letter)", () => {
    const hdfcPack = (n: number) =>
      asReadyPackForTest(
        Array.from({ length: n }, (_, i) => row(i + 1, { contractRef: i === 0 ? "MSA-1" : null })),
        "HDFC Bank",
      );

    it("follows HDFC's 2B column order and is not a placeholder", () => {
      const l = getLayout("hdfc");
      expect(l).toMatchObject({ id: "hdfc", version: "1", placeholder: false, pdfStyle: "hdfc-letter" });
      expect(l.columns.map((c) => c.header)).toEqual([
        "Sr no.",
        "Service Recipient Name & Address",
        "Country",
        "Invoice No.",
        "Invoice Date",
        "Currency",
        "Amount",
        "Net Realisable Value",
        "Contract number if any",
        "Description of Services",
        "SAC Code",
        "Remarks",
      ]);
      expect(l.columns.map((c) => c.key)).toEqual([
        "serialNo",
        "clientNameAndAddress",
        "clientCountry",
        "invoiceNo",
        "invoiceDate",
        "invoiceAmount.currency",
        "invoiceAmount",
        "netRealisableValue",
        "contractRef",
        "serviceDescription",
        "sacCode",
        "remarks",
      ]);
    });

    it("other banks keep the table PDF style", () => {
      for (const id of ["generic", "icici", "axis"]) expect(getLayout(id).pdfStyle).toBe("table");
    });

    it("xlsx has serial numbers, one recipient name-and-address cell and an empty remarks cell", async () => {
      const r = await renderPack(hdfcPack(3), "hdfc", []);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(file(r, ".xlsx").bytes as unknown as ArrayBuffer);
      const ws = wb.getWorksheet("EDF")!;
      expect(ws.rowCount).toBe(4);
      for (const n of [1, 2, 3]) {
        const xr = ws.getRow(n + 1);
        expect(xr.getCell(1).value).toBe(n);
        expect(xr.getCell(2).value).toBe(`Client ${n}\n1 Main St, NYC`);
        expect(xr.getCell(4).value).toBe(`INV-${n}`);
        expect(xr.getCell(12).value).toBeNull();
      }
      expect(ws.getRow(2).getCell(9).value).toBe("MSA-1");
      expect(ws.getRow(3).getCell(9).value).toBeNull();
    });

    it("xlsx is deterministic", async () => {
      const a = file(await renderPack(hdfcPack(3), "hdfc", []), ".xlsx").bytes;
      const b = file(await renderPack(hdfcPack(3), "hdfc", []), ".xlsx").bytes;
      expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    });

    it("renders the letter as a valid A4 PDF without the unverified banner", async () => {
      const r = await renderPack(hdfcPack(2), "hdfc", []);
      const bytes = file(r, ".pdf").bytes;
      expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
      const doc = await PDFDocument.load(bytes);
      expect(doc.getPageCount()).toBeGreaterThanOrEqual(1);
      expect(doc.getPage(0).getSize().width).toBeCloseTo(595.28, 1);
      expect(await pdfDraws(bytes, "Request letter for Export of Services")).toBe(true);
      expect(await pdfDraws(bytes, "OFAC Declaration:")).toBe(true);
      expect(await pdfDraws(bytes, "AUTHORISED SIGNATORY")).toBe(true);
      expect(await pdfDraws(bytes, "Layout follows HDFC Bank")).toBe(true);
      expect(await pdfDraws(bytes, "not yet verified")).toBe(false);
      // FEMA undertaking says "services", not the form's leftover "goods".
      expect(await pdfDraws(bytes, "above mentioned services under the extant")).toBe(true);
      expect(await pdfDraws(bytes, "See annexure")).toBe(false);
    });

    it("renders with an empty AD code, leaving the AD Code box blank", async () => {
      const pack = hdfcPack(1);
      (pack as { adBank: { adCode: string } }).adBank.adCode = "";
      const bytes = file(await renderPack(pack, "hdfc", []), ".pdf").bytes;
      expect(await PDFDocument.load(bytes)).toBeTruthy();
      expect(await pdfDraws(bytes, "AD Code:")).toBe(true);
      expect(await pdfDraws(bytes, "undefined")).toBe(false);
    });

    it("moves more than 4 invoices to an annexure page", async () => {
      const few = await PDFDocument.load(file(await renderPack(hdfcPack(4), "hdfc", []), ".pdf").bytes);
      const bytes = file(await renderPack(hdfcPack(5), "hdfc", []), ".pdf").bytes;
      const many = await PDFDocument.load(bytes);
      expect(many.getPageCount()).toBeGreaterThanOrEqual(2);
      expect(many.getPageCount()).toBeGreaterThan(few.getPageCount());
      expect(await pdfDraws(bytes, "See annexure")).toBe(true);
      expect(await pdfDraws(bytes, "details of invoices")).toBe(true);
      const big = await PDFDocument.load(file(await renderPack(hdfcPack(60), "hdfc", []), ".pdf").bytes);
      expect(big.getPageCount()).toBeGreaterThan(many.getPageCount());
    });

    it("lists the country of final destination only when every row shares it", async () => {
      const same = file(await renderPack(hdfcPack(2), "hdfc", []), ".pdf").bytes;
      expect(await pdfDraws(same, "Country of Final Destination:")).toBe(true);
      expect(await pdfDraws(same, "As per table")).toBe(false);
      const mixed = asReadyPackForTest([row(1), row(2, { clientCountry: "GB" })], "HDFC Bank");
      expect(await pdfDraws(file(await renderPack(mixed, "hdfc", []), ".pdf").bytes, "As per table")).toBe(true);
    });

    it("guide drops the unverified note and the portal claim", async () => {
      const md = new TextDecoder().decode(file(await renderPack(hdfcPack(1), "hdfc", []), ".md").bytes);
      expect(md.toLowerCase()).not.toContain("unverified");
      expect(md.toLowerCase()).not.toContain("portal");
      expect(md).toContain("Trade Desk");
      expect(md).toContain("2026-11-30");
      expect(md).not.toMatch(/\{(bank|month|dueDate)\}/);
    });
  });

  it("other banks keep the placeholder banner in the PDF", async () => {
    for (const id of ["icici", "axis"]) {
      const bytes = file(await renderPack(asReadyPackForTest([row(1)]), id, []), ".pdf").bytes;
      expect(await pdfDraws(bytes, "not yet verified")).toBe(true);
    }
    const generic = file(await renderPack(asReadyPackForTest([row(1)]), "generic", []), ".pdf").bytes;
    expect(await pdfDraws(generic, "not yet verified")).toBe(false);
  });
});
