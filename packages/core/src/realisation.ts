import type { Allocation, InvoiceFacts, IsoDate, Money } from "./types";

export type RealisationStatus = "open" | "partially_realised" | "realised" | "overdue";

export interface Realisation {
  deadline: IsoDate; // invoiceDate + 9 months (INR invoice: + 12)
  status: RealisationStatus;
  realised: Money; // sum of confirmed allocations
  outstanding: Money;
}

export function realisationOf(
  _invoice: InvoiceFacts,
  _allocations: Allocation[],
  _asOf: IsoDate,
): Realisation {
  throw new Error("not implemented");
}
