import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney, type EdfRow, type Money, type ReadyPack } from "@korra/core";
import type { Layout } from "./layouts";
import { renderHdfcLetter } from "./pdf-hdfc";
import { H, M, W, drawFooters, fit, sanitise, totalsByCurrency, wrap } from "./pdf-util";
import { monthLabel } from "./util";

// Re-exported for existing importers (declaration.ts).
export { fit, sanitise, wrap };

const COLS = [
  { h: "Invoice no", w: 62 },
  { h: "Date", w: 46 },
  { h: "Client", w: 78 },
  { h: "Ctry", w: 24 },
  { h: "Cur", w: 26 },
  { h: "Amount", w: 56 },
  { h: "Net realisable", w: 56 },
  { h: "SAC", w: 40 },
  { h: "Service description", w: 135 },
];
const SIZE = 7;
const ROW_H = 22;

function cells(r: EdfRow): string[] {
  const major = (m: Money) => formatMoney(m).slice(m.currency.length + 1);
  return [
    r.invoiceNo,
    r.invoiceDate,
    r.clientName,
    r.clientCountry,
    r.invoiceAmount.currency,
    major(r.invoiceAmount),
    major(r.netRealisableValue),
    r.sacCode,
    r.serviceDescription,
  ];
}

export async function renderPdf(pack: ReadyPack, layout: Layout): Promise<Uint8Array> {
  if (layout.pdfStyle === "hdfc-letter") return renderHdfcLetter(pack, layout);
  const doc = await PDFDocument.create();
  doc.setTitle("Export Declaration Form - Services");
  doc.setProducer("Korra");
  doc.setCreator("Korra");
  doc.setCreationDate(new Date(pack.generatedAt));
  doc.setModificationDate(new Date(pack.generatedAt));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const s = (t: string) => sanitise(font, t);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const text = (t: string, x: number, size = 9, f: PDFFont = font) =>
    page.drawText(sanitise(f, t), { x, y, size, font: f, color: rgb(0, 0, 0) });

  text("Export Declaration Form — Services", M, 15, bold);
  y -= 20;
  text(`Month: ${monthLabel(pack.month)}`, M, 10);
  y -= 14;
  text(`AD bank: ${pack.adBank.name}   AD code: ${pack.adBank.adCode || "____________"}`, M, 10);
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
  y -= 4;
  const e = pack.exporter;
  text("Exporter", M, 10, bold);
  y -= 13;
  for (const line of [e.legalName, e.address, `PAN: ${e.pan}    GSTIN: ${e.gstin}    IEC: ${e.iec ?? "—"}`]) {
    text(fit(font, s(line), 9, W - 2 * M), M);
    y -= 12;
  }
  y -= 10;

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
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const MIN_Y = M + 30;

  tableHeader();
  for (const r of pack.rows) {
    if (y - ROW_H < MIN_Y) {
      newPage();
      tableHeader();
    }
    const vals = cells(r);
    let x = M;
    COLS.forEach((c, i) => {
      const v = s(vals[i] ?? "");
      const lines = i === COLS.length - 1 ? wrap(font, v, SIZE, c.w - 4, 2) : [fit(font, v, SIZE, c.w - 4)];
      lines.forEach((l, li) => page.drawText(l, { x, y: y - li * 8, size: SIZE, font }));
      x += c.w;
    });
    y -= ROW_H;
  }

  const totals = totalsByCurrency(pack.rows);
  if (y - (24 + totals.length * 12) < MIN_Y) newPage();
  y -= 6;
  text("Totals", M, 10, bold);
  y -= 13;
  for (const [cur, t] of totals) {
    text(`${cur}: invoice amount ${formatMoney(t.amount)}, net realisable ${formatMoney(t.nrv)}`, M, 9);
    y -= 12;
  }

  drawFooters(doc, font);
  return doc.save();
}
