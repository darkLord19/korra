import ExcelJS from "exceljs";
import Papa from "papaparse";

export interface Table {
  headers: string[];
  rows: Record<string, string>[];
}

export function readCsv(bytes: Uint8Array): Table {
  const text = new TextDecoder("utf-8").decode(bytes).replace(/^\uFEFF/, "");
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim(),
  });
  const headers = (parsed.meta.fields ?? []).filter((h) => h !== "");
  const rows = parsed.data.map((r) => {
    const out: Record<string, string> = {};
    for (const h of headers) out[h] = (r[h] ?? "").toString().trim();
    return out;
  });
  return { headers, rows };
}

function cellToString(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (typeof v === "string") return v.trim();
  if (typeof v === "object") {
    if ("result" in v && v.result !== undefined) return cellToString(v.result as ExcelJS.CellValue);
    if ("richText" in v) return v.richText.map((t) => t.text).join("").trim();
    if ("text" in v && typeof v.text === "string") return v.text.trim();
    if ("error" in v) return "";
  }
  return "";
}

/** Reads the first worksheet; the first non-empty row is the header row. */
export async function readXlsx(bytes: Uint8Array): Promise<Table> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(bytes as unknown as ArrayBuffer);
  const ws = wb.worksheets[0];
  if (!ws) return { headers: [], rows: [] };

  let headers: string[] = [];
  let headerRow = 0;
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (headerRow) return;
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (c, col) => {
      cells[col - 1] = cellToString(c.value);
    });
    if (cells.some((c) => c)) {
      headers = Array.from(cells, (c) => c ?? "");
      headerRow = n;
    }
  });
  if (!headerRow) return { headers: [], rows: [] };

  const rows: Record<string, string>[] = [];
  ws.eachRow({ includeEmpty: false }, (row, n) => {
    if (n <= headerRow) return;
    const rec: Record<string, string> = {};
    let any = false;
    headers.forEach((h, i) => {
      if (!h) return;
      const v = cellToString(row.getCell(i + 1).value);
      if (v) any = true;
      rec[h] = v;
    });
    if (any) rows.push(rec);
  });
  return { headers: headers.filter((h) => h !== ""), rows };
}
