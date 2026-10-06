import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney, type EdfRow, type Money, type ReadyPack } from "@korra/core";
import type { Layout } from "./layouts";
import { monthLabel } from "./util";

const W = 595.28;
const H = 841.89;
const M = 36;
const FOOTER = "Prepared by Korra. Not legal or tax advice. Verify before submission.";

/** Standard fonts only encode WinAnsi: map the rupee sign to INR, replace anything else unencodable. */
export function sanitise(font: PDFFont, s: string): string {
  const supported = new Set(font.getCharacterSet());
  let out = "";
  for (const ch of s.replace(/₹/g, "INR ").replace(/\s+/g, " ")) {
    out += supported.has(ch.codePointAt(0)!) ? ch : "?";
  }
  return out;
}

export function fit(font: PDFFont, text: string, size: number, width: number): string {
  if (font.widthOfTextAtSize(text, size) <= width) return text;
  let t = text;
  while (t.length > 1 && font.widthOfTextAtSize(t + "...", size) > width) t = t.slice(0, -1);
  return t + "...";
}

export function wrap(font: PDFFont, text: string, size: number, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const word of text.split(" ")) {
    const next = cur ? `${cur} ${word}` : word;
    if (font.widthOfTextAtSize(next, size) <= width) cur = next;
    else {
      if (cur) lines.push(cur);
      cur = word;
    }
  }
  if (cur) lines.push(cur);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = (kept[maxLines - 1] ?? "") + " ...";
    return kept.map((l) => fit(font, l, size, width));
  }
  return lines.map((l) => fit(font, l, size, width));
}

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
  text(`AD bank: ${pack.adBank.name}   AD code: ${pack.adBank.adCode}`, M, 10);
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

  // Totals per currency (bigint minor units, never floats).
  const totals = new Map<string, { amount: Money; nrv: Money }>();
  for (const r of pack.rows) {
    const cur = r.invoiceAmount.currency;
    const t = totals.get(cur) ?? {
      amount: { minor: 0n, currency: cur },
      nrv: { minor: 0n, currency: r.netRealisableValue.currency },
    };
    t.amount = { ...t.amount, minor: t.amount.minor + r.invoiceAmount.minor };
    t.nrv = { ...t.nrv, minor: t.nrv.minor + r.netRealisableValue.minor };
    totals.set(cur, t);
  }
  if (y - (24 + totals.size * 12) < MIN_Y) newPage();
  y -= 6;
  text("Totals", M, 10, bold);
  y -= 13;
  for (const [cur, t] of [...totals].sort(([a], [b]) => (a < b ? -1 : 1))) {
    text(`${cur}: invoice amount ${formatMoney(t.amount)}, net realisable ${formatMoney(t.nrv)}`, M, 9);
    y -= 12;
  }

  const pages = doc.getPages();
  pages.forEach((p, i) => {
    const grey = rgb(0.35, 0.35, 0.35);
    p.drawText(FOOTER, { x: M, y: M - 12, size: 7, font, color: grey });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, {
      x: W - M - font.widthOfTextAtSize(label, 7),
      y: M - 12,
      size: 7,
      font,
      color: grey,
    });
  });
  return doc.save();
}
