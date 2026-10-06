import type { Money, PaymentFacts, ReceiptMode } from "@korra/core";
import {
  HEURISTIC,
  field,
  missing,
  parseAmount,
  parseCurrency,
  parseDate,
  parseRate,
} from "../normalize";
import { DEEL_ALIASES, type DeelColumn } from "./deel-aliases";
import { resolveColumns, type RailParser } from "./rail";

type Cols = Partial<Record<DeelColumn, string>>;

const WITHDRAWAL = /withdraw|payout|cash\s*out/i;

/** Detection weights; "type" is mandatory because it is what separates Deel from the generic template. */
const WEIGHTS: Record<DeelColumn, number> = {
  type: 0.2,
  date: 0.2,
  amount: 0.2,
  currency: 0.1,
  method: 0.1,
  receivedAmount: 0.1,
  receivedCurrency: 0.05,
  fxRate: 0.025,
  fee: 0.025,
  reference: 0,
  payer: 0,
};

function inferReceiptMode(
  method: string,
  amountCurrency: string | null,
  receivedCurrency: string | null,
): ReceiptMode | null {
  const m = method.toLowerCase();
  if (/swift|wire|international/.test(m)) return "swift";
  if (/local|bank\s*transfer|\binr\b/.test(m)) return "local_transfer";
  if (receivedCurrency === "INR" && amountCurrency !== null && amountCurrency !== "INR") {
    return "local_transfer";
  }
  return null;
}

export const deelParser: RailParser = {
  rail: "deel",

  detect(headers) {
    const cols = resolveColumns(headers, DEEL_ALIASES);
    if (!cols.type) return 0;
    let score = 0;
    for (const k of Object.keys(WEIGHTS) as DeelColumn[]) if (cols[k]) score += WEIGHTS[k];
    return Math.min(1, score);
  },

  parse(rows) {
    const warnings: string[] = [];
    const payments: Omit<PaymentFacts, "id">[] = [];
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    const cols: Cols = resolveColumns(headers, DEEL_ALIASES);

    if (rows.length === 0) warnings.push("Deel export has a header but no rows.");
    for (const k of ["date", "amount", "currency"] as const) {
      if (!cols[k] && rows.length > 0) {
        warnings.push(`Deel export: no "${k}" column found; ${k} will be empty (see alias table).`);
      }
    }
    if (!cols.fee && rows.length > 0) warnings.push('Deel export: no "fee" column found; fees left empty.');
    if (!cols.method && !cols.receivedCurrency && rows.length > 0) {
      warnings.push("Deel export: no withdrawal method or received-currency column; receipt mode left empty.");
    }

    const get = (row: Record<string, string>, k: DeelColumn) => (cols[k] ? (row[cols[k]!] ?? "") : "");
    let ignored = 0;

    rows.forEach((row, i) => {
      const rowNo = i + 2; // 1-based, header is row 1
      const typeText = get(row, "type");
      if (!WITHDRAWAL.test(typeText)) {
        ignored++;
        return;
      }

      const amountCurrency = parseCurrency(get(row, "currency"));
      const receivedCurrency = parseCurrency(get(row, "receivedCurrency"));

      const dateP = get(row, "date") ? parseDate(get(row, "date")) : null;
      if (get(row, "date") && !dateP) warnings.push(`Row ${rowNo}: could not read date "${get(row, "date")}".`);

      let foreign: Money | null = null;
      let foreignConf = 1;
      if (get(row, "amount") && amountCurrency) {
        const p = parseAmount(get(row, "amount"), amountCurrency);
        if (p) {
          foreign = p.value;
          foreignConf = p.confidence;
        } else warnings.push(`Row ${rowNo}: could not read amount "${get(row, "amount")}".`);
      } else if (get(row, "amount") && !amountCurrency) {
        warnings.push(`Row ${rowNo}: amount present but currency missing or invalid.`);
      }

      const mode = inferReceiptMode(get(row, "method"), amountCurrency, receivedCurrency);
      if (mode === null) warnings.push(`Row ${rowNo}: could not tell local transfer from SWIFT; set receipt mode in review.`);

      let inr: Money | null = null;
      let inrConf = 1;
      if (receivedCurrency === "INR" && get(row, "receivedAmount")) {
        const p = parseAmount(get(row, "receivedAmount"), "INR");
        if (p) {
          inr = p.value;
          inrConf = p.confidence;
        }
      }

      let fees: Money | null = null;
      if (get(row, "fee") && amountCurrency) {
        const p = parseAmount(get(row, "fee"), amountCurrency);
        if (p) fees = p.value;
      }
      const rate = get(row, "fxRate") ? parseRate(get(row, "fxRate")) : null;

      payments.push({
        rail: "deel",
        receiptMode: mode ? field(mode, HEURISTIC) : missing(),
        date: dateP ? field(dateP.value, dateP.confidence) : missing(),
        foreignAmount: foreign ? field(foreign, foreignConf) : missing(),
        inrCredited: inr ? field(inr, inrConf) : missing(),
        fxRate: rate ? field(rate, 1) : missing(),
        // Fee currency is not exported separately; assumed to be the amount currency.
        fees: fees ? field(fees, HEURISTIC) : missing(),
        firaRef: missing(), // swift: filled later from the FIRA upload; local_transfer: none exists
        purposeCode: missing(),
        payerName: get(row, "payer") ? field(get(row, "payer"), 1) : missing(),
        realisingBankName: missing(),
      });
    });

    if (ignored > 0) {
      warnings.push(`${ignored} non-withdrawal row(s) ignored (invoice / payment-received rows are not payments).`);
    }
    return { payments, invoices: [], warnings };
  },
};
