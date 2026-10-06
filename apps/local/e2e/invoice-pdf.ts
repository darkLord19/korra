import { PDFDocument, StandardFonts } from "pdf-lib";

/** The text a typical invoice carries (same lines the local extractor's unit tests read). */
export const INVOICE_LINES = [
  "JANE DEV CONSULTING",
  "12 MG Road, Bengaluru 560001, India",
  "GSTIN: 29ABCDE1234F1Z5",
  "TAX INVOICE",
  "Invoice No: INV-2026-014",
  "Invoice Date: 02 Sep 2026",
  "Due Date: 02 Oct 2026",
  "Bill To:",
  "Acme Corp",
  "1 Main Street",
  "New York, NY 10001",
  "United States",
  "Description Qty Rate Amount",
  "Software development services - September 2026 1 $1,500.00 $1,500.00",
  "SAC: 998314",
  "Subtotal $1,500.00",
  "Total Due USD 1,500.00",
];

/**
 * A real PDF with a text layer. (apps/web's stub PDF bytes are not parseable: its fake extractor never opens them.
 * Here the real pdf.js extractor runs, under the strict CSP, in the browser.)
 */
export async function makeInvoicePdf(lines: string[] = INVOICE_LINES): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const page = pdf.addPage([595, 842]);
  lines.forEach((line, i) => page.drawText(line, { x: 50, y: 790 - i * 22, size: 11, font }));
  return Buffer.from(await pdf.save());
}
