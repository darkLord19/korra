import type { Allocation, InvoiceFacts, PaymentFacts } from "./types";

export interface MatchTolerance {
  amountPct: number; // default 0.03, covering rail fees and FX spread on foreignAmount vs invoice amount
  dateWindowDays: number; // default: payment between invoiceDate - 7 and invoiceDate + 270
}

export interface MatchProposal {
  allocations: Allocation[]; // existing confirmed and rejected allocations stay as they are; new ones are "proposed"
  unmatchedInvoiceIds: string[]; // still declared; they go to the tracker as Open
  unmatchedPaymentIds: string[];
}

export function proposeMatches(
  _invoices: InvoiceFacts[],
  _payments: PaymentFacts[],
  _existing: Allocation[],
  _tolerance?: Partial<MatchTolerance>,
): MatchProposal {
  throw new Error("not implemented");
}
