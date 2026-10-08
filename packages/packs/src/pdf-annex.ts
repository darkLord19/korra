import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney, type EdfRow, type Money, type ReadyPack } from "@korra/core";
import type { ColumnKey, Layout } from "./layouts";
import {
  DECLARATION_4,
  H,
  M,
  W,
  drawFooters,
  sanitise,
  totalsByCurrency,
  wrap,
  type PdfStampOptions,
  type SignatureBox,
} from "./pdf-util";

const CW = W - 2 * M;
const MIN_Y = M + 18;
const INK = rgb(0, 0, 0);
const GREY = rgb(0.45, 0.45, 0.45);
const LIGHT = rgb(0.9, 0.9, 0.9);

const TITLE = "EXPORT DECLARATION FORM (EDF) — SERVICES";
const SUBTITLE = "Statutory Export Declaration under FEMA 23(R)/2026-RB (Form given at Annex)";
const TABLE_TITLE = "PART 2B — DETAILS OF SERVICES PROVIDED TO MULTIPLE RECIPIENTS";

const SECTION_5 = "PART 5 — SPACE FOR USE OF SPECIFIED AUTHORITY (AUTHORISED DEALER)";
const SECTION_5_TEXT =
  "Certified, on the basis of above declaration at 4, that the goods/services described above and the export value declared by the exporter in this form is as per the corresponding invoice/gist of invoices submitted and declared by the exporter.";
const SECTION_5_SIGN = "(Signature of Designated/Authorised officials of Authorised Dealer)";
const LAYOUT_NOTE =
  "Statutory EDF format prescribed under RBI notification FEMA 23(R)/2026-RB.";

const ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function letterDate(iso: string): string {
  const [y = "", m = "", d = ""] = iso.slice(0, 10).split("-");
  return `${d}-${ABBR[Number(m) - 1] ?? m}-${y}`;
}

const major = (m: Money) => formatMoney(m).slice(m.currency.length + 1);

const KEY_W: Partial<Record<ColumnKey, number>> = {
  serialNo: 22,
  clientNameAndAddress: 90,
  clientCountry: 34,
  invoiceNo: 48,
  invoiceDate: 46,
  "invoiceAmount.currency": 26,
  invoiceAmount: 52,
  netRealisableValue: 52,
  contractRef: 54,
  serviceDescription: 70,
  sacCode: 34,
  remarks: 34,
};
const RIGHT_ALIGNED = new Set<ColumnKey>(["invoiceAmount", "netRealisableValue"]);

function cellText(r: EdfRow, key: ColumnKey, index: number): string {
  switch (key) {
    case "serialNo":
      return String(index + 1);
    case "clientNameAndAddress":
      return `${r.clientName}, ${r.clientAddress}`;
    case "remarks":
      return "";
    case "invoiceAmount":
      return major(r.invoiceAmount);
    case "invoiceAmount.currency":
      return r.invoiceAmount.currency;
    case "netRealisableValue":
      return major(r.netRealisableValue);
    case "netRealisableValue.currency":
      return r.netRealisableValue.currency;
    default:
      return r[key] ?? "";
  }
}

export const ANNEX_SIGNATURE_BOX: SignatureBox = {
  x: M + 230,
  y: 0,
  width: 140,
  height: 42,
  pageIndex: 0,
};

export async function renderRbiAnnex(
  pack: ReadyPack,
  layout: Layout,
  options?: PdfStampOptions,
): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(`Export Declaration Form (EDF) - ${pack.adBank.name}`);
  doc.setProducer("Korra");
  doc.setCreator("Korra");
  doc.setCreationDate(new Date(pack.generatedAt));
  doc.setModificationDate(new Date(pack.generatedAt));
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page: PDFPage = doc.addPage([W, H]);
  let y = H - M;
  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - M;
  };
  const ensure = (h: number) => {
    if (y - h < MIN_Y) newPage();
  };
  const width = (t: string, size: number, f: PDFFont = font) => f.widthOfTextAtSize(sanitise(f, t), size);
  const draw = (t: string, x: number, yy: number, size: number, f: PDFFont = font, color = INK) =>
    page.drawText(sanitise(f, t), { x, y: yy, size, font: f, color });
  const rule = (x1: number, x2: number, yy: number, thickness = 0.5, color = GREY) =>
    page.drawLine({ start: { x: x1, y: yy }, end: { x: x2, y: yy }, thickness, color });

  const para = (text: string, size = 7.5, f: PDFFont = font, lead = size + 2.2) => {
    const lines = wrap(f, sanitise(f, text), size, CW, 999);
    ensure(lines.length * lead);
    for (const l of lines) {
      y -= lead;
      draw(l, M, y + 2, size, f);
    }
    y -= 3;
  };
  const heading = (text: string, size = 8.5) => {
    ensure(size + 14 + 30);
    y -= 6;
    y -= size + 2;
    draw(text, M, y + 2, size, bold);
  };

  type Cell = { label: string; value?: string; w?: number; lines?: number };
  const fields = (cells: Cell[]) => {
    const laid = cells.map((c) => ({ c, vx: 0, right: 0, vlines: [] as string[], n: 1 }));
    const totalW = cells.reduce((a, c) => a + (c.w ?? 1), 0);
    let x = M;
    for (const l of laid) {
      const cw = ((l.c.w ?? 1) / totalW) * CW;
      l.right = x + cw - (cells.length > 1 ? 8 : 0);
      l.vx = x + width(l.c.label, 7.5, bold) + 4;
      const max = l.c.lines ?? 1;
      l.vlines = l.c.value ? wrap(font, sanitise(font, l.c.value), 7.5, l.right - l.vx, max) : [];
      l.n = Math.max(1, l.vlines.length || (l.c.lines ?? 1));
      x += cw;
    }
    const maxN = Math.max(...laid.map((l) => l.n));
    const h = maxN * 11 + 3;
    ensure(h);
    x = M;
    for (const l of laid) {
      const cw = ((l.c.w ?? 1) / totalW) * CW;
      draw(l.c.label, x, y - 8, 7.5, bold);
      if (l.vlines.length > 0) {
        l.vlines.forEach((line, i) => draw(line, l.vx, y - 8 - i * 10, 7.5));
      } else {
        rule(l.vx, l.right, y - 9.5, 0.4);
      }
      x += cw;
    }
    y -= h;
  };

  // --- Title block -------------------------------------------------------------------------
  draw(TITLE, M, y - 10, 11, bold);
  y -= 14;
  draw(SUBTITLE, M, y - 8, 7.5, font, GREY);
  y -= 12;
  rule(M, W - M, y, 0.8, INK);
  y -= 6;

  // --- Part 1: General Information ---------------------------------------------------------
  heading("PART 1 — GENERAL INFORMATION");
  y -= 2;
  const e = pack.exporter;
  fields([
    { label: "Type of Export:", value: "Services", w: 1 },
    { label: "Form No.:", w: 1 },
    { label: "Date:", value: letterDate(pack.generatedAt), w: 1 },
  ]);
  fields([
    { label: "Exporter Name:", value: e.legalName, w: 2 },
    { label: "PAN:", value: e.pan, w: 1 },
    { label: "GSTIN:", value: e.gstin, w: 1.2 },
  ]);
  fields([
    { label: "Exporter Address:", value: e.address, w: 3, lines: 2 },
    { label: "IE Code:", value: e.iec || "N.A.", w: 1 },
  ]);
  fields([
    { label: "AD Bank Name:", value: pack.adBank.name, w: 1.8 },
    { label: "AD code:", value: pack.adBank.adCode || "____________", w: 1 },
    { label: "Mode of Delivery:", value: "Internet / Telecommunication", w: 1.5 },
  ]);
  fields([
    { label: "Mode of Realisation:", value: "Remittance through banking channel", w: 2 },
    { label: "Category of Exporter:", value: "Customs (DTA units)", w: 1.2 },
  ]);
  fields([
    { label: "Total Value in Words (INR):", w: 1, lines: 1 },
  ]);

  // --- Part 2B: Services Table -------------------------------------------------------------
  const cols = layout.columns;
  const totalWeight = cols.reduce((a, c) => a + (KEY_W[c.key] ?? 40), 0);
  const cw = cols.map((c) => ((KEY_W[c.key] ?? 40) / totalWeight) * CW);

  const SZ = 6.5;
  const LH = 8.5;
  const PAD = 3;

  const drawTableHeader = () => {
    ensure(18);
    let x = M;
    const h = 16;
    cols.forEach((c, i) => {
      const hw = cw[i]!;
      page.drawRectangle({ x, y: y - h, width: hw, height: h, color: LIGHT, borderColor: GREY, borderWidth: 0.5 });
      const lines = wrap(bold, sanitise(bold, c.header), SZ, hw - 2 * PAD, 2);
      lines.forEach((l, li) => {
        const tx = RIGHT_ALIGNED.has(c.key) ? x + hw - PAD - width(l, SZ, bold) : x + PAD;
        draw(l, tx, y - PAD - (li + 1) * LH + 1.5, SZ, bold);
      });
      x += hw;
    });
    y -= h;
  };

  const drawRows = (rows: EdfRow[]) => {
    rows.forEach((r, idx) => {
      const lines = cols.map((c, i) => wrap(font, sanitise(font, cellText(r, c.key, idx)), SZ, cw[i]! - 2 * PAD, 6));
      const maxLines = Math.max(1, ...lines.map((ls) => ls.length));
      const h = Math.max(14, maxLines * LH + 2 * PAD);
      if (y - h < MIN_Y) {
        newPage();
        drawTableHeader();
      }
      let x = M;
      cols.forEach((c, i) => {
        lines[i]!.forEach((l, li) => {
          const tx = RIGHT_ALIGNED.has(c.key) ? x + cw[i]! - PAD - width(l, SZ) : x + PAD;
          draw(l, tx, y - PAD - (li + 1) * LH + 1.5, SZ);
        });
        page.drawRectangle({ x, y: y - h, width: cw[i]!, height: h, borderColor: GREY, borderWidth: 0.5 });
        x += cw[i]!;
      });
      y -= h;
    });
  };

  const totals = totalsByCurrency(pack.rows);
  const drawTotals = () => {
    ensure(14 + totals.length * 11);
    y -= 5;
    draw("Total (per currency):", M, y - 8, 7.5, bold);
    y -= 11;
    for (const [cur, t] of totals) {
      draw(`${cur}: Amount ${formatMoney(t.amount)}, Net Realisable Value ${formatMoney(t.nrv)}`, M, y - 6, 7.5);
      y -= 10;
    }
  };

  heading(TABLE_TITLE);
  y -= 3;
  drawTableHeader();
  drawRows(pack.rows);
  drawTotals();

  // --- Part 4: Declaration by Exporters ----------------------------------------------------
  heading("PART 4 — DECLARATION BY THE EXPORTER");
  for (const p of DECLARATION_4) para(p);

  // --- Signatory Block & Section 5 --------------------------------------------------------
  const s5Lines = wrap(font, sanitise(font, SECTION_5_TEXT), 7.5, CW - 12, 99);
  const sigH = 65;
  const s5H = 16 + s5Lines.length * 9.5 + 26;
  ensure(sigH + s5H + 10);

  y -= 6;
  const sigBoxY = y - 48;
  const sigBoxW = 140;
  const sigBoxH = 42;
  const sigBoxX = M + 230;

  const sealBoxX = M + 385;
  const sealBoxW = 120;
  const sealBoxH = 42;

  // Signatory details (left side)
  draw("Authorised Signatory:", M, y - 10, 7.5, bold);
  if (options?.signatory?.name) {
    draw(options.signatory.name, M + 95, y - 10, 7.5);
  } else {
    rule(M + 95, sigBoxX - 10, y - 11, 0.4);
  }

  draw("Designation:", M, y - 22, 7.5, bold);
  if (options?.signatory?.designation) {
    draw(options.signatory.designation, M + 60, y - 22, 7.5);
  } else {
    rule(M + 60, sigBoxX - 10, y - 23, 0.4);
  }

  draw(`Date: ${letterDate(pack.generatedAt)}`, M, y - 34, 7.5);
  draw("Place: ____________", M + 100, y - 34, 7.5);

  // Signature box (middle)
  page.drawRectangle({
    x: sigBoxX,
    y: sigBoxY,
    width: sigBoxW,
    height: sigBoxH,
    borderColor: GREY,
    borderWidth: 0.5,
  });
  draw("(Signature of Exporter)", sigBoxX + 16, sigBoxY - 9, 6.5, font, GREY);

  if (options?.signature) {
    try {
      const sigImg = await (doc.embedPng(options.signature).catch(() => doc.embedJpg(options.signature!)));
      const dims = sigImg.scaleToFit(sigBoxW - 8, sigBoxH - 8);
      page.drawImage(sigImg, {
        x: sigBoxX + (sigBoxW - dims.width) / 2,
        y: sigBoxY + (sigBoxH - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
    } catch {
      // ignore invalid signature image bytes
    }
  }

  // Seal box (right)
  page.drawRectangle({
    x: sealBoxX,
    y: sigBoxY,
    width: sealBoxW,
    height: sealBoxH,
    borderColor: GREY,
    borderWidth: 0.5,
  });
  draw("(Company Seal / Stamp)", sealBoxX + 10, sigBoxY - 9, 6.5, font, GREY);

  if (options?.seal) {
    try {
      const sealImg = await (doc.embedPng(options.seal).catch(() => doc.embedJpg(options.seal!)));
      const dims = sealImg.scaleToFit(sealBoxW - 8, sealBoxH - 8);
      page.drawImage(sealImg, {
        x: sealBoxX + (sealBoxW - dims.width) / 2,
        y: sigBoxY + (sealBoxH - dims.height) / 2,
        width: dims.width,
        height: dims.height,
      });
    } catch {
      // ignore invalid seal image bytes
    }
  }

  y = sigBoxY - 20;

  // --- Part 5: Specified Authority ---------------------------------------------------------
  const boxTop = y;
  y -= 12;
  draw(SECTION_5, M + 6, y, 7.5, bold);
  y -= 4;
  for (const l of s5Lines) {
    y -= 9.5;
    draw(l, M + 6, y, 7.2);
  }
  y -= 16;
  draw("Date: ____________   Place: ____________", M + 6, y, 7.2, bold);
  draw(SECTION_5_SIGN, M + 240, y, 7);
  y -= 6;
  page.drawRectangle({ x: M, y, width: CW, height: boxTop - y, borderColor: GREY, borderWidth: 0.6 });

  drawFooters(doc, font, [LAYOUT_NOTE]);
  return doc.save();
}
