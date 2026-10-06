import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  formatMoney,
  type DeclarationRow,
  type DeclarationRowStatus,
  type Money,
  type ReadyDeclaration,
} from "@korra/core";
import type { RenderedPack } from "./rendered";
import { fit, sanitise, wrap } from "./pdf";
import { getDeclarationLayout, type DeclarationColumnKey, type DeclarationLayout } from "./layouts";
import { bankSlug, toMajor } from "./util";

const W = 595.28;
const H = 841.89;
const M = 36;
const FOOTER = "Prepared by Korra. Not legal or tax advice. Your bank decides whether to accept this declaration.";
const TITLE = "Declaration for closure of EDPMS entries — export of services";
const REFERENCE =
  "Under Regulation 4(2) (and Regulation 6, where marked) of the Foreign Exchange Management (Export and Import of Goods and Services) Regulations, 2026";
const DECLARATION_TEXT =
  "I/We declare that payment against each invoice listed below, each of value up to ₹10 lakh (or its equivalent in foreign currency), has been realised either in full or otherwise, as indicated. For invoices marked as reduced or not realised, I/We request reduction of export value under Regulation 6.";

const STATUS_LONG: Record<DeclarationRowStatus, string> = {
  realised_in_full: "Realised in full",
  partly_realised_reduction: "Partly realised - reduction requested (Reg. 6)",
  not_realised_reduction: "Not realised - reduction requested (Reg. 6)",
};
const STATUS_SHORT: Record<DeclarationRowStatus, string> = {
  realised_in_full: "Realised in full",
  partly_realised_reduction: "Reduced (Reg. 6)",
  not_realised_reduction: "Not realised (Reg. 6)",
};

/** File-name key: the quarter ("2026-Q4") or "invoice-<number>" for a single-invoice declaration. */
export function declarationPeriodKey(d: ReadyDeclaration): string {
  if (typeof d.period === "string") return d.period;
  const no = (d.rows[0]?.invoiceNo ?? d.period.invoiceId)
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `invoice-${no || "x"}`;
}

const major = (m: Money) => formatMoney(m).slice(m.currency.length + 1);

// ---------------------------------------------------------------- XLSX

function cell(row: DeclarationRow, key: DeclarationColumnKey): string | number | Date {
  switch (key) {
    case "invoiceAmount":
      return toMajor(row.invoiceAmount);
    case "inrEquivalent":
      return toMajor(row.inrEquivalent);
    case "realisedAmount":
      return toMajor(row.realisedAmount);
    case "invoiceDate":
      return new Date(`${row.invoiceDate}T00:00:00Z`);
    case "status":
      return STATUS_LONG[row.status];
    case "paymentDates":
      return row.evidence.paymentDates;
    case "references":
      return row.evidence.references;
    case "receiptModes":
      return row.evidence.receiptModes;
    default:
      return row[key];
  }
}

const WIDTHS: Partial<Record<DeclarationColumnKey, number>> = {
  clientName: 26,
  status: 40,
  paymentDates: 24,
  references: 34,
  receiptModes: 20,
};

async function renderDeclarationXlsx(layout: DeclarationLayout, rows: DeclarationRow[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Korra";
  wb.created = new Date(0);
  wb.modified = new Date(0);
  const ws = wb.addWorksheet("Declaration", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = layout.columns.map((c, i) => ({ header: c.header, key: `c${i}`, width: WIDTHS[c.key] ?? 16 }));
  ws.getRow(1).font = { bold: true };
  for (const r of rows) {
    const added = ws.addRow(layout.columns.map((c) => cell(r, c.key)));
    layout.columns.forEach((c, i) => {
      const xc = added.getCell(i + 1);
      if (c.key === "invoiceDate") xc.numFmt = "yyyy-mm-dd";
      else if (c.key === "invoiceAmount" || c.key === "inrEquivalent" || c.key === "realisedAmount") {
        xc.numFmt = "#,##0.00";
      }
    });
  }
  return new Uint8Array((await wb.xlsx.writeBuffer()) as ArrayBuffer);
}

// ---------------------------------------------------------------- PDF

const COLS = [
  { h: "Invoice no", w: 58 },
  { h: "Date", w: 44 },
  { h: "Client", w: 70 },
  { h: "Cur", w: 24 },
  { h: "Invoice amt", w: 52 },
  { h: "INR equiv.", w: 58 },
  { h: "Realised", w: 52 },
  { h: "Status", w: 70 },
  { h: "Payment date / ref", w: 95 },
];
const SIZE = 7;
const ROW_H = 22;

function pdfCells(r: DeclarationRow): string[] {
  const evidence = [r.evidence.paymentDates, r.evidence.references].filter(Boolean).join(" / ");
  return [
    r.invoiceNo,
    r.invoiceDate,
    r.clientName,
    r.currency,
    major(r.invoiceAmount),
    major(r.inrEquivalent),
    major(r.realisedAmount),
    STATUS_SHORT[r.status],
    evidence,
  ];
}

async function renderDeclarationPdf(d: ReadyDeclaration, layout: DeclarationLayout): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(TITLE);
  doc.setProducer("Korra");
  doc.setCreator("Korra");
  doc.setCreationDate(new Date(d.generatedAt));
  doc.setModificationDate(new Date(d.generatedAt));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const s = (t: string) => sanitise(font, t);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const text = (t: string, x: number, size = 9, f: PDFFont = font) =>
    page.drawText(sanitise(f, t), { x, y, size, font: f, color: rgb(0, 0, 0) });
  const paragraph = (t: string, size = 9, gap = 12) => {
    for (const line of wrap(font, s(t), size, W - 2 * M, 12)) {
      text(line, M, size);
      y -= gap;
    }
  };

  text(TITLE, M, 13, bold);
  y -= 20;
  text(`AD bank: ${d.adBank.name}   AD code: ${d.adBank.adCode}`, M, 10);
  y -= 14;
  text(`Period: ${d.periodLabel}`, M, 10);
  y -= 14;
  if (layout.placeholder) {
    page.drawText(s("Bank-specific format not yet verified — generic layout"), {
      x: M,
      y,
      size: 9,
      font: bold,
      color: rgb(0.75, 0.1, 0.1),
    });
    y -= 14;
  }
  y -= 2;
  const e = d.exporter;
  text("Exporter", M, 10, bold);
  y -= 13;
  for (const line of [e.legalName, e.address, `PAN: ${e.pan}    GSTIN: ${e.gstin}    IEC: ${e.iec ?? "—"}`]) {
    text(fit(font, s(line), 9, W - 2 * M), M);
    y -= 12;
  }
  y -= 8;
  paragraph(REFERENCE, 8.5, 11);
  y -= 6;
  paragraph(DECLARATION_TEXT, 9, 12);
  y -= 10;

  const MIN_Y = M + 30;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const tableHeader = () => {
    let x = M;
    for (const c of COLS) {
      text(c.h, x, SIZE, bold);
      x += c.w;
    }
    y -= 4;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.5 });
    y -= 12;
  };

  tableHeader();
  for (const r of d.rows) {
    if (y - ROW_H < MIN_Y) {
      newPage();
      tableHeader();
    }
    const vals = pdfCells(r);
    let x = M;
    COLS.forEach((c, i) => {
      const v = s(vals[i] ?? "");
      const lines = i === COLS.length - 1 ? wrap(font, v, SIZE, c.w - 4, 2) : [fit(font, v, SIZE, c.w - 4)];
      lines.forEach((l, li) => page.drawText(l, { x, y: y - li * 8, size: SIZE, font }));
      x += c.w;
    });
    y -= ROW_H;
  }

  // Totals (bigint minor units, never floats): INR equivalent overall, invoice and realised per currency.
  let inrMinor = 0n;
  const byCur = new Map<string, { invoice: bigint; realised: bigint }>();
  for (const r of d.rows) {
    inrMinor += r.inrEquivalent.minor;
    const t = byCur.get(r.currency) ?? { invoice: 0n, realised: 0n };
    t.invoice += r.invoiceAmount.minor;
    t.realised += r.realisedAmount.minor;
    byCur.set(r.currency, t);
  }
  const reduced = d.rows.filter((r) => r.status !== "realised_in_full").length;
  const SIGN_H = 4 * 26 + 10;
  if (y - (30 + byCur.size * 12 + SIGN_H) < MIN_Y) newPage();
  y -= 6;
  text("Totals", M, 10, bold);
  y -= 13;
  text(
    `${d.rows.length} invoice(s), ${reduced} marked reduced or not realised. INR equivalent: ${formatMoney({ minor: inrMinor, currency: "INR" })}`,
    M,
    9,
  );
  y -= 12;
  for (const [cur, t] of [...byCur].sort(([a], [b]) => (a < b ? -1 : 1))) {
    text(
      `${cur}: invoice amount ${formatMoney({ minor: t.invoice, currency: cur })}, realised ${formatMoney({ minor: t.realised, currency: cur })}`,
      M,
      9,
    );
    y -= 12;
  }

  y -= 22;
  for (const label of ["Signature", "Name", "Date", "Place"]) {
    text(`${label}:`, M, 9, bold);
    page.drawLine({ start: { x: M + 60, y: y - 2 }, end: { x: M + 260, y: y - 2 }, thickness: 0.5 });
    y -= 26;
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const grey = rgb(0.35, 0.35, 0.35);
    p.drawText(s(FOOTER), { x: M, y: M - 12, size: 7, font, color: grey });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, { x: W - M - font.widthOfTextAtSize(label, 7), y: M - 12, size: 7, font, color: grey });
  });
  return doc.save();
}

// ---------------------------------------------------------------- guide + entry

function renderDeclarationGuide(layout: DeclarationLayout, bankName: string, periodLabel: string): string {
  const vars: Record<string, string> = { bank: bankName, period: periodLabel };
  return layout.guide.replace(/\{(bank|period)\}/g, (_, k: string) => vars[k] ?? "");
}

const enc = new TextEncoder();

/**
 * Renders the declaration PDF (A4), the XLSX of the same rows (layout column order) and a how-to-submit
 * guide. RBI prescribes no format; placeholder layouts carry an "unverified" note in the PDF and guide.
 */
export async function renderDeclaration(ready: ReadyDeclaration, layoutId: string): Promise<RenderedPack> {
  const layout = getDeclarationLayout(layoutId);
  const slug = bankSlug(ready.adBank.name);
  const key = declarationPeriodKey(ready);
  const [pdf, xlsx] = await Promise.all([renderDeclarationPdf(ready, layout), renderDeclarationXlsx(layout, ready.rows)]);
  return {
    files: [
      { name: `DECLARATION-${slug}-${key}.pdf`, mimeType: "application/pdf", bytes: pdf },
      {
        name: `DECLARATION-${slug}-${key}.xlsx`,
        mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        bytes: xlsx,
      },
      {
        name: `HOW-TO-SUBMIT-DECLARATION-${slug}.md`,
        mimeType: "text/markdown",
        bytes: enc.encode(renderDeclarationGuide(layout, ready.adBank.name, ready.periodLabel)),
      },
    ],
  };
}
