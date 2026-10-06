import { pctToBps } from "./bps";
import { addMonths } from "./dates";
import { DEFAULT_AMOUNT_TOLERANCE_PCT } from "./matching";
import { addMoney, money } from "./money";
import type { Allocation, InvoiceFacts, IsoDate, Money } from "./types";

export type RealisationStatus = "open" | "partially_realised" | "realised" | "overdue";

export interface Realisation {
  deadline: IsoDate; // invoiceDate + 9 months (INR invoice: + 12)
  status: RealisationStatus;
  realised: Money; // sum of confirmed allocations
  outstanding: Money;
}

/**
 * Callers only pass declared invoices, so a null invoiceDate or amount is a programming
 * error: this throws (naming the invoice id) rather than inventing a result.
 * `outstanding` is clamped at zero when over-realised; `realised` is the raw confirmed sum.
 */
export function realisationOf(
  invoice: InvoiceFacts,
  allocations: Allocation[],
  asOf: IsoDate,
): Realisation {
  const invoiceDate = invoice.invoiceDate.value;
  const amount = invoice.amount.value;
  if (invoiceDate === null) throw new Error(`realisationOf: invoice ${invoice.id} has no invoiceDate`);
  if (amount === null) throw new Error(`realisationOf: invoice ${invoice.id} has no amount`);

  const months = amount.currency === "INR" ? 12 : 9;
  const deadline = addMonths(invoiceDate, months);

  let realised = money(0, amount.currency);
  for (const a of allocations) {
    if (a.invoiceId === invoice.id && a.status === "confirmed") realised = addMoney(realised, a.amount);
  }
  const outstandingMinor = amount.minor > realised.minor ? amount.minor - realised.minor : 0n;
  const outstanding = money(outstandingMinor, amount.currency);

  const isRealised = outstandingMinor * 10_000n <= pctToBps(DEFAULT_AMOUNT_TOLERANCE_PCT) * amount.minor;
  let status: RealisationStatus;
  if (isRealised) status = "realised";
  else if (asOf > deadline) status = "overdue";
  else if (realised.minor > 0n) status = "partially_realised";
  else status = "open";

  return { deadline, status, realised, outstanding };
}
