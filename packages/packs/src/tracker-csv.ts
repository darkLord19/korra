import { minorExponent } from "@korra/core";

/** Money as the wire carries it: minor units as a decimal string. */
export interface CsvMoney {
  minor: string;
  currency: string;
}

/** One tracker row, with the confirmed payments behind its realised amount. Structural, so the wire rows fit as they are. */
export interface TrackerCsvRow {
  invoiceNo: string | null;
  clientName: string | null;
  /** ISO date. */
  invoiceDate: string;
  amount: CsvMoney;
  realised: CsvMoney;
  outstanding: CsvMoney;
  /** ISO date. */
  deadline: string;
  status: "open" | "partially_realised" | "realised" | "overdue";
  payments: { date: string | null; amount: CsvMoney; reference: string | null }[];
}

const STATUS_LABEL: Record<TrackerCsvRow["status"], string> = {
  open: "Open",
  partially_realised: "Partially realised",
  realised: "Realised",
  overdue: "Overdue",
};

export const TRACKER_CSV_HEADER = [
  "Invoice no.",
  "Client",
  "Invoice date",
  "EDF month",
  "Currency",
  "Invoice amount",
  "Realised amount",
  "Outstanding amount",
  "Realisation due date",
  "Status",
  "Matched payments",
] as const;

/** Spreadsheet formulas start with one of these; OWASP's CSV-injection guard is to defuse the cell with a leading `'`. */
const FORMULA_START = /^[=+\-@\t\r]/;

/** One CSV cell (RFC 4180 quoting) with the formula-injection guard applied to every cell. */
export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Major units, exact (bigint arithmetic): `12345` USD minor -> `123.45`. */
export function majorString(m: CsvMoney): string {
  const exp = minorExponent(m.currency);
  const minor = BigInt(m.minor);
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const base = 10n ** BigInt(exp);
  const frac = exp > 0 ? `.${(abs % base).toString().padStart(exp, "0")}` : "";
  return `${neg ? "-" : ""}${abs / base}${frac}`;
}

function paymentsText(r: TrackerCsvRow): string {
  return r.payments
    .map((p) => `${p.date ?? "undated"} ${p.amount.currency} ${majorString(p.amount)}${p.reference ? ` (ref ${p.reference})` : ""}`)
    .join("; ");
}

/**
 * The tracker as a CSV: only values the tracker screen shows (plus the EDF month, which is the invoice date's month,
 * and the confirmed payments behind the realised amount). UTF-8 with a BOM so Excel reads names and symbols
 * correctly, CRLF line endings.
 */
export function buildTrackerCsv(rows: TrackerCsvRow[]): string {
  const lines = [
    [...TRACKER_CSV_HEADER],
    ...rows.map((r) => [
      r.invoiceNo ?? "",
      r.clientName ?? "",
      r.invoiceDate,
      r.invoiceDate.slice(0, 7),
      r.amount.currency,
      majorString(r.amount),
      majorString(r.realised),
      majorString(r.outstanding),
      r.deadline,
      STATUS_LABEL[r.status],
      paymentsText(r),
    ]),
  ];
  return `\uFEFF${lines.map((cells) => cells.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
