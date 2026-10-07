import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatMoney, type EdfRow, type Money, type ReadyPack } from "@korra/core";
import type { ColumnKey, Layout } from "./layouts";
import { H, M, W, drawFooters, fit, sanitise, totalsByCurrency, wrap } from "./pdf-util";
import { monthLabel } from "./util";

/**
 * HDFC Bank's request letter for service-export EDF filing (published 30 Sep 2026), drawn with
 * standard fonts. Values Korra knows are filled in; everything else is a blank write-in line,
 * because the allowed values of HDFC's dropdown fields are not published.
 * See docs/research/2026-10-07-hdfc-edf-official-form.md.
 */

const CW = W - 2 * M;
const MIN_Y = M + 18;
const INK = rgb(0, 0, 0);
const GREY = rgb(0.45, 0.45, 0.45);
const LIGHT = rgb(0.9, 0.9, 0.9);

/** Rows that fit on the letter's own 2B table; more go to the annexure pages. */
const LETTER_ROWS = 4;

const TITLE = "Request letter for Export of Services & EDF Filing Cum Disposal Instructions for Credit";
const TABLE_TITLE = "2B. Details of Export Value^ of Services (For more then 1 Invoice, Use Annexure)";

const OFAC =
  "I/We hereby declare that the above transaction does not involve and is not designed for the purpose of any contravention or evasion of the provision of the OFAC.";
// The published letter says "goods" in the first sentence (a leftover); it says "Services" at its end.
const FEMA =
  "We are eligible to export the above mentioned services under the extant Foreign Trade policy. I / We hereby declare that the above transaction does not involve, and is not designed for the purpose of any contravention or evasion of the provisions of the FEMA 1999 or of any rule, regulation, notification, direction or order made thereunder. I/ We also hereby agree and undertake to give such information/ documents as will reasonably satisfy you about this transaction in terms of the above declaration. I/ We also undertake that if I/ We refuse to comply with any such requirements or make only unsatisfactory compliance therewith, the bank shall refuse in writing to undertake the transaction and shall if it has reason to believe that any contravention /evasion is contemplated by me /us report the matter to Reserve Bank of India. *I / We further declare that the undersigned has/have the authority to give this declaration and undertaking on behalf of the firm/company.";
const DECLARATION_4 = [
  "I /We hereby declare that I/we @am/are the seller/consignor of the goods/ provider of services in respect of which this declaration is made and that the particulars given above are true and that the value to be received from the buyer/third party represents the export value^ contracted and declared above. I/We undertake that I/we have delivered/ will deliver to the authorised dealer named above the foreign exchange / Indian Rupees representing the full value of the goods/services exported as above on or before........................ (i.e. within the period of realisation stipulated by RBI from time to time) in the manner specified in the Regulations made under the Foreign Exchange Management Act, 1999.",
  "I/We also undertake to submit the documents pertaining to exports declared in this form, to the Authorised Dealer named above, as may be required under the Act.",
];
const ELIGIBLE = "We are eligible to export the above mentioned Services under the current Foreign Trade policy in place,";
const SECTION_5 = "5. Space for use of Specified Authority (Customs/SEZ/AD/STPI):";
const SECTION_5_TEXT =
  "Certified, on the basis of above declaration at 4, that the goods/services described above and the export value^ declared by the exporter in this form is as per the corresponding invoice/gist of invoices submitted and declared by the exporter.";
const SECTION_5_SIGN = "(Signature of Designated/Authorised officials of Custom /SEZ/ Authorised Dealer/STPI)";
const LAYOUT_NOTE =
  "Layout follows HDFC Bank's EDF request letter published 30 Sep 2026 — confirm your branch accepts it.";

const ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** ISO timestamp or date to DD-MMM-YYYY. */
function letterDate(iso: string): string {
  const [y = "", m = "", d = ""] = iso.slice(0, 10).split("-");
  return `${d}-${ABBR[Number(m) - 1] ?? m}-${y}`;
}

const major = (m: Money) => formatMoney(m).slice(m.currency.length + 1);

/** Relative column widths (points) before scaling to the page width. */
const KEY_W: Partial<Record<ColumnKey, number>> = {
  serialNo: 22,
  clientNameAndAddress: 90,
  clientCountry: 36,
  invoiceNo: 50,
  invoiceDate: 46,
  "invoiceAmount.currency": 40,
  invoiceAmount: 52,
  netRealisableValue: 52,
  contractRef: 56,
  serviceDescription: 72,
  sacCode: 34,
  remarks: 36,
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

const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))];

export async function renderHdfcLetter(pack: ReadyPack, layout: Layout): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Request letter for Export of Services & EDF Filing - HDFC Bank");
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

  /** Wrapped paragraph, kept together on one page. */
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
    ensure(size + 14 + 40); // keep with the text that follows
    y -= 6;
    y -= size + 2;
    draw(text, M, y + 2, size, bold);
  };

  /**
   * One row of inline "Label: value" cells. Known values sit on the line; a missing value leaves the
   * line empty to write on. `lines` > 1 wraps a long value.
   */
  type Cell = { label: string; value?: string; w?: number; lines?: number; spacer?: boolean };
  const fields = (cells: Cell[]) => {
    // Lay out first: a known value takes only the lines it needs, a blank takes `lines` write-in lines.
    const laid = cells.map((c) => ({ c, vx: 0, right: 0, vlines: [] as string[], n: 1 }));
    const totalW = cells.reduce((a, c) => a + (c.w ?? 1), 0);
    let x = M;
    for (const l of laid) {
      const cw = ((l.c.w ?? 1) / totalW) * CW;
      l.right = x + cw - (cells.length > 1 ? 10 : 0);
      l.vx = x + width(l.c.label, 7.5, bold) + 4;
      const max = l.c.lines ?? 1;
      l.vlines = l.c.value ? wrap(font, sanitise(font, l.c.value), 8, l.right - l.vx, max) : [];
      l.n = l.c.value ? Math.max(1, l.vlines.length) : max;
      x += cw;
    }
    const rowH = 16 + (Math.max(...laid.map((l) => l.n)) - 1) * 10;
    ensure(rowH);
    for (const { c, vx, right, vlines, n } of laid) {
      if (c.spacer) continue;
      draw(c.label, vx - width(c.label, 7.5, bold) - 4, y - 11, 7.5, bold);
      for (let i = 0; i < n; i++) {
        const ly = y - 11 - i * 10;
        const t = vlines[i];
        if (t) draw(t, vx, ly, 8);
        rule(vx, right, ly - 2.5, 0.4);
      }
    }
    y -= rowH;
  };

  // --- Title, addressee, date ---------------------------------------------------------------
  for (const l of wrap(bold, TITLE, 11, CW, 2)) {
    y -= 13;
    draw(l, M, y, 11, bold);
  }
  y -= 12;
  draw("To,", M, y, 8.5);
  const dateStr = `Date: ${letterDate(pack.generatedAt)}`;
  draw(dateStr, W - M - width(dateStr, 8.5), y, 8.5);
  y -= 11;
  draw("HDFC BANK LTD", M, y, 8.5, bold);
  fields([{ label: "Branch:", w: 1 }, { label: "", spacer: true, w: 1.4 }]);
  draw(`Export month: ${monthLabel(pack.month)}`, M, y - 3, 7.5, font, GREY);
  y -= 14;

  // --- Header block -------------------------------------------------------------------------
  const rows = pack.rows;
  const e = pack.exporter;
  const countries = uniq(rows.map((r) => r.clientCountry));
  const descriptions = uniq(rows.map((r) => r.serviceDescription));
  fields([{ label: "Account no. to be Credited:" }]);
  fields([{ label: "Purpose Code & Details:" }]);
  fields([{ label: "Exchange Rate/ Forward Contract details if any:" }]);
  fields([
    { label: "AD Code:", value: pack.adBank.adCode, w: 1 },
    { label: "IEC:", value: e.iec ?? "", w: 1 },
    { label: "GSTIN:", value: e.gstin, w: 1.3 },
  ]);
  fields([{ label: "Customer PAN:", value: e.pan, w: 1 }, { label: "AD Name:", value: pack.adBank.name, w: 1.5 }]);
  fields([{ label: "AD Address:" }]);
  fields([{ label: "Exporter Name & Address:", value: `${e.legalName}, ${e.address}`, lines: 2 }]);
  fields([{ label: "Type of Export (Select from the List):" }, { label: "Category of Export:" }]);
  fields([{ label: "Mode of Transport (Select from the list):" }, { label: "Category of Exporter (Select from List):" }]);
  fields([{ label: "Mode of Realisation:" }, { label: "L/C No. (If Any):" }]);
  fields([
    { label: "Dispatch Indicator (Select from List):" },
    { label: "Country of Final Destination:", value: countries.length === 1 ? countries[0] : "As per table" },
  ]);
  fields([{ label: "Date of Export/ Expected date of Service for Advance (DD-MM-YYYY):" }]);
  fields([
    {
      label: "Description of Services:",
      value: descriptions.length === 1 ? descriptions[0] : "As per table",
      lines: descriptions.length === 1 ? 2 : 1,
    },
  ]);
  fields([{ label: "Total FOB Value (IN WORDS) (INR):", lines: 2 }]);
  fields([{ label: "Third Party (Yes/No):", w: 1 }, { label: "Third Party Name & Address:", w: 2.2 }]);

  // --- 2B table -----------------------------------------------------------------------------
  const cols = layout.columns;
  const base = cols.map((c) => KEY_W[c.key] ?? 40);
  const scale = CW / base.reduce((a, b) => a + b, 0);
  const cw = base.map((b) => b * scale);
  const PAD = 2;
  const LH = 7.6;
  const SZ = 6.5;
  const MAX_CELL_LINES = 6;

  const headerLines = cols.map((c, i) => wrap(bold, sanitise(bold, c.header), SZ, cw[i]! - 2 * PAD, 4));
  const headH = Math.max(...headerLines.map((l) => l.length)) * LH + 2 * PAD;
  const drawTableHeader = () => {
    ensure(headH + 40);
    page.drawRectangle({ x: M, y: y - headH, width: CW, height: headH, color: LIGHT, borderColor: GREY, borderWidth: 0.5 });
    let x = M;
    cols.forEach((_, i) => {
      headerLines[i]!.forEach((l, li) => draw(l, x + PAD, y - PAD - (li + 1) * LH + 1.8, SZ, bold));
      x += cw[i]!;
      if (i < cols.length - 1) page.drawLine({ start: { x, y }, end: { x, y: y - headH }, thickness: 0.5, color: GREY });
    });
    y -= headH;
  };
  const drawRows = (list: EdfRow[], from: number) => {
    list.forEach((r, k) => {
      const lines = cols.map((c, i) => {
        const t = sanitise(font, cellText(r, c.key, from + k));
        return t ? wrap(font, t, SZ, cw[i]! - 2 * PAD, MAX_CELL_LINES) : [];
      });
      const h = Math.max(1, ...lines.map((l) => l.length)) * LH + 2 * PAD;
      if (y - h < MIN_Y) {
        newPage();
        drawTableHeader();
      }
      let x = M;
      cols.forEach((c, i) => {
        lines[i]!.forEach((l, li) => {
          const tx = RIGHT_ALIGNED.has(c.key) ? x + cw[i]! - PAD - width(l, SZ) : x + PAD;
          draw(l, tx, y - PAD - (li + 1) * LH + 1.8, SZ);
        });
        page.drawRectangle({ x, y: y - h, width: cw[i]!, height: h, borderColor: GREY, borderWidth: 0.5 });
        x += cw[i]!;
      });
      y -= h;
    });
  };
  const totals = totalsByCurrency(rows);
  const drawTotals = () => {
    ensure(14 + totals.length * 11);
    y -= 5;
    draw("Total (per currency)", M, y - 8, 7.5, bold);
    y -= 12;
    for (const [cur, t] of totals) {
      draw(`${cur}: Amount ${formatMoney(t.amount)}, Net Realisable Value ${formatMoney(t.nrv)}`, M, y - 6, 7.5);
      y -= 10;
    }
  };

  heading(TABLE_TITLE);
  y -= 3;
  draw("Details of Invoice", M, y - 6, 7, font, GREY);
  y -= 9;
  const annexure = rows.length > LETTER_ROWS;
  if (annexure) {
    ensure(26);
    y -= 12;
    draw(
      fit(font, `See annexure: ${rows.length} invoices are listed in the Annexure (details of invoices) at the end of this letter.`, 8, CW),
      M,
      y,
      8,
      bold,
    );
    y -= 4;
  } else {
    drawTableHeader();
    drawRows(rows, 0);
  }
  drawTotals();

  // --- Charges, contact, declarations ---------------------------------------------------------
  y -= 4;
  fields([{ label: "Debit all processing charges from account no:" }]);
  fields([{ label: "In case of any queries please contact us on Tel. No:", w: 1.3 }, { label: "or email us at:", w: 1 }]);
  heading("OFAC Declaration:");
  para(OFAC);
  heading("FEMA DECLARATION-CUM-UNDERTAKING:");
  para(FEMA);
  heading("Declaration 4:");
  for (const p of DECLARATION_4) para(p);
  para(ELIGIBLE);
  fields([{ label: "Remark (If Any):" }]);
  fields([{ label: "For" }]);

  // Signature and Section 5 stay together on one page.
  const s5Lines = wrap(font, sanitise(font, SECTION_5_TEXT), 7.5, CW - 12, 99);
  const sigH = 54;
  const s5H = 20 + s5Lines.length * 9.7 + 34;
  ensure(sigH + s5H + 10);
  y -= 30;
  rule(M, M + 190, y, 0.6, INK);
  draw("AUTHORISED SIGNATORY", M, y - 10, 8, bold);
  draw("(Signature as per Bank record with company seal)", M, y - 20, 7.5);
  y -= 32;

  const boxTop = y;
  y -= 12;
  draw(SECTION_5, M + 6, y, 8, bold);
  y -= 4;
  for (const l of s5Lines) {
    y -= 9.7;
    draw(l, M + 6, y, 7.5);
  }
  y -= 22;
  draw("Date:", M + 6, y, 7.5, bold);
  rule(M + 30, M + 130, y - 2.5, 0.4);
  draw(SECTION_5_SIGN, M + 150, y, 7);
  y -= 8;
  page.drawRectangle({ x: M, y, width: CW, height: boxTop - y, borderColor: GREY, borderWidth: 0.6 });

  // --- Annexure -----------------------------------------------------------------------------
  if (annexure) {
    newPage();
    y -= 12;
    draw("Annexure — details of invoices", M, y, 12, bold);
    y -= 12;
    draw(
      fit(font, sanitise(font, `Request letter for Export of Services & EDF Filing — ${e.legalName} — ${monthLabel(pack.month)}`), 8, CW),
      M,
      y,
      8,
      font,
      GREY,
    );
    y -= 6;
    draw("Details of Invoice", M, y - 8, 7, font, GREY);
    y -= 12;
    drawTableHeader();
    drawRows(rows, 0);
    drawTotals();
  }

  drawFooters(doc, font, [LAYOUT_NOTE]);
  return doc.save();
}
