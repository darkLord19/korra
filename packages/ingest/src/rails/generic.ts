import type { Money, PaymentFacts, ReceiptMode } from "@korra/core";
import { field, missing, parseAmount, parseCurrency, parseDate, parseRate } from "../normalize";
import { resolveColumns, type AliasTable, type RailParser } from "./rail";

/** Documented template: packages/ingest/fixtures/generic/TEMPLATE.md */
type GenericColumn =
  | "date"
  | "amount"
  | "currency"
  | "inrCredited"
  | "fxRate"
  | "fees"
  | "firaRef"
  | "purposeCode"
  | "payer"
  | "receiptMode"
  | "bank";

const ALIASES: AliasTable<GenericColumn> = {
  date: ["date"],
  amount: ["amount"],
  currency: ["currency"],
  inrCredited: ["inr_credited"],
  fxRate: ["fx_rate"],
  fees: ["fees"],
  firaRef: ["fira_ref"],
  purposeCode: ["purpose_code"],
  payer: ["payer"],
  receiptMode: ["receipt_mode"],
  bank: ["bank"],
};

const REQUIRED: GenericColumn[] = ["date", "amount", "currency"];
const OPTIONAL = (Object.keys(ALIASES) as GenericColumn[]).filter((k) => !REQUIRED.includes(k));

function parseMode(raw: string): ReceiptMode | null {
  const s = raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
  if (s === "swift") return "swift";
  if (s === "local_transfer" || s === "local") return "local_transfer";
  return null;
}

export const genericParser: RailParser = {
  rail: "generic",

  detect(headers) {
    const cols = resolveColumns(headers, ALIASES);
    const req = REQUIRED.filter((k) => cols[k]).length;
    if (req < REQUIRED.length) return req * 0.1;
    const opt = OPTIONAL.filter((k) => cols[k]).length;
    return 0.5 + 0.5 * (opt / OPTIONAL.length);
  },

  parse(rows) {
    const warnings: string[] = [];
    const payments: Omit<PaymentFacts, "id">[] = [];
    const cols = resolveColumns(rows[0] ? Object.keys(rows[0]) : [], ALIASES);
    const get = (row: Record<string, string>, k: GenericColumn) => (cols[k] ? (row[cols[k]!] ?? "") : "");
    if (rows.length === 0) warnings.push("CSV has a header but no rows.");

    rows.forEach((row, i) => {
      const rowNo = i + 2;
      const currency = parseCurrency(get(row, "currency"));
      if (!currency) warnings.push(`Row ${rowNo}: missing or invalid currency.`);

      const dateP = get(row, "date") ? parseDate(get(row, "date")) : null;
      if (!dateP) warnings.push(`Row ${rowNo}: could not read date "${get(row, "date")}".`);

      let foreign: { value: Money; confidence: number } | null = null;
      if (currency && get(row, "amount")) foreign = parseAmount(get(row, "amount"), currency);
      if (!foreign) warnings.push(`Row ${rowNo}: could not read amount "${get(row, "amount")}".`);

      const inr = get(row, "inrCredited") ? parseAmount(get(row, "inrCredited"), "INR") : null;
      if (get(row, "inrCredited") && !inr) warnings.push(`Row ${rowNo}: could not read inr_credited.`);
      const fees = currency && get(row, "fees") ? parseAmount(get(row, "fees"), currency) : null;
      const rate = get(row, "fxRate") ? parseRate(get(row, "fxRate")) : null;
      const mode = parseMode(get(row, "receiptMode"));
      const text = (k: GenericColumn) => (get(row, k) ? field(get(row, k), 1) : missing<string>());

      payments.push({
        rail: "generic",
        receiptMode: mode ? field(mode, 1) : missing(),
        date: dateP ? field(dateP.value, dateP.confidence) : missing(),
        foreignAmount: foreign ? field(foreign.value, foreign.confidence) : missing(),
        inrCredited: inr ? field(inr.value, inr.confidence) : missing(),
        fxRate: rate ? field(rate, 1) : missing(),
        fees: fees ? field(fees.value, fees.confidence) : missing(),
        firaRef: text("firaRef"),
        purposeCode: text("purposeCode"),
        payerName: text("payer"),
        realisingBankName: text("bank"),
      });
    });
    return { payments, invoices: [], warnings };
  },
};
