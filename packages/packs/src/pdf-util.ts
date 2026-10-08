import { rgb, type PDFDocument, type PDFFont } from "pdf-lib";
import type { EdfRow, Money } from "@korra/core";

/** A4 in points, and the page margin shared by the PDF renderers. */
export const W = 595.28;
export const H = 841.89;
export const M = 36;
export const FOOTER = "Prepared by Korra. Not legal or tax advice. Verify before submission.";

export const DECLARATION_4 = [
  "I /We hereby declare that I/we @am/are the seller/consignor of the goods/ provider of services in respect of which this declaration is made and that the particulars given above are true and that the value to be received from the buyer/third party represents the export value^ contracted and declared above. I/We undertake that I/we have delivered/ will deliver to the authorised dealer named above the foreign exchange / Indian Rupees representing the full value of the goods/services exported as above on or before........................ (i.e. within the period of realisation stipulated by RBI from time to time) in the manner specified in the Regulations made under the Foreign Exchange Management Act, 1999.",
  "I/We also undertake to submit the documents pertaining to exports declared in this form, to the Authorised Dealer named above, as may be required under the Act.",
] as const;

export interface SignatureBox {
  x: number;
  y: number;
  width: number;
  height: number;
  pageIndex: number;
}

export interface PdfStampOptions {
  signature?: Uint8Array;
  seal?: Uint8Array;
  signatory?: {
    name: string;
    designation: string;
  };
}

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

/** Per-currency totals (bigint minor units, never floats), sorted by currency code. */
export function totalsByCurrency(rows: EdfRow[]): [string, { amount: Money; nrv: Money }][] {
  const totals = new Map<string, { amount: Money; nrv: Money }>();
  for (const r of rows) {
    const cur = r.invoiceAmount.currency;
    const t = totals.get(cur) ?? {
      amount: { minor: 0n, currency: cur },
      nrv: { minor: 0n, currency: r.netRealisableValue.currency },
    };
    t.amount = { ...t.amount, minor: t.amount.minor + r.invoiceAmount.minor };
    t.nrv = { ...t.nrv, minor: t.nrv.minor + r.netRealisableValue.minor };
    totals.set(cur, t);
  }
  return [...totals].sort(([a], [b]) => (a < b ? -1 : 1));
}

/** Footer on every page: the standard disclaimer, optional extra small lines below it, and page numbers. */
export function drawFooters(doc: PDFDocument, font: PDFFont, extraLines: string[] = []): void {
  const pages = doc.getPages();
  const grey = rgb(0.35, 0.35, 0.35);
  pages.forEach((p, i) => {
    p.drawText(FOOTER, { x: M, y: M - 12, size: 7, font, color: grey });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, {
      x: W - M - font.widthOfTextAtSize(label, 7),
      y: M - 12,
      size: 7,
      font,
      color: grey,
    });
    extraLines.forEach((line, li) => {
      p.drawText(sanitise(font, line), { x: M, y: M - 21 - li * 8, size: 6.5, font, color: grey });
    });
  });
}
