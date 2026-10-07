import ExcelJS from "exceljs";
import type { EdfRow } from "@korra/core";
import type { ColumnKey, Layout } from "./layouts";
import { toMajor } from "./util";

/** `index` is the 0-based row position (for `serialNo`). */
function cell(row: EdfRow, key: ColumnKey, index: number): string | number | Date | null {
  switch (key) {
    case "serialNo":
      return index + 1;
    case "clientNameAndAddress":
      return `${row.clientName}\n${row.clientAddress}`;
    case "remarks":
      return null;
    case "invoiceAmount":
      return toMajor(row.invoiceAmount);
    case "invoiceAmount.currency":
      return row.invoiceAmount.currency;
    case "netRealisableValue":
      return toMajor(row.netRealisableValue);
    case "netRealisableValue.currency":
      return row.netRealisableValue.currency;
    case "invoiceDate":
      return new Date(`${row.invoiceDate}T00:00:00Z`);
    default:
      return row[key];
  }
}

const WIDTHS: Partial<Record<ColumnKey, number>> = {
  exporterAddress: 36,
  clientAddress: 36,
  serviceDescription: 48,
  exporterLegalName: 26,
  clientName: 26,
  clientNameAndAddress: 40,
  serialNo: 8,
  remarks: 24,
};

export async function renderXlsx(layout: Layout, rows: EdfRow[]): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "Korra";
  wb.created = new Date(0);
  wb.modified = new Date(0);
  const ws = wb.addWorksheet("EDF", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = layout.columns.map((c, i) => ({
    header: c.header,
    key: `c${i}`,
    width: WIDTHS[c.key] ?? 16,
  }));
  ws.getRow(1).font = { bold: true };
  rows.forEach((r, ri) => {
    const added = ws.addRow(layout.columns.map((c) => cell(r, c.key, ri)));
    layout.columns.forEach((c, i) => {
      const xc = added.getCell(i + 1);
      if (c.key === "invoiceDate") xc.numFmt = "yyyy-mm-dd";
      else if (c.key === "invoiceAmount" || c.key === "netRealisableValue") xc.numFmt = "#,##0.00";
      if (c.key === "clientNameAndAddress") xc.alignment = { wrapText: true, vertical: "top" };
    });
  });
  const buf = await wb.xlsx.writeBuffer();
  return new Uint8Array(buf as ArrayBuffer);
}
