import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { PDFDocument } from "pdf-lib";
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
    for (const id of ["icici", "hdfc", "axis"]) {
      expect(l.find((x) => x.id === id)?.placeholder).toBe(true);
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
});
