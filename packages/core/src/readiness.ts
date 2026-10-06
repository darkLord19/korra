import type { AdBank, ExporterProfile, InvoiceFacts, IsoDate, Money, YearMonth } from "./types";

export interface PackDraft {
  month: YearMonth;
  adBank: AdBank;
  exporter: ExporterProfile;
  invoices: InvoiceFacts[];
  pendingDocumentIds: string[]; // invoice (or unclassified) documents still ingesting
}

export type Blocker =
  | { kind: "missing_field"; entity: "invoice" | "exporter"; id: string; field: string }
  | { kind: "flagged_field"; entity: "invoice"; id: string; field: string; confidence: number }
  | { kind: "document_pending"; documentId: string }
  | { kind: "no_invoices" };

/**
 * One declared invoice flattened with its exporter columns. Values only (no Field
 * wrappers). No payment columns: the EDF is an invoice declaration. Single row model
 * that every bank layout renders.
 */
export interface EdfRow {
  // exporter
  exporterLegalName: string;
  exporterAddress: string;
  exporterPan: string;
  exporterGstin: string;
  exporterIec: string | null;
  // invoice
  invoiceNo: string;
  invoiceDate: IsoDate;
  clientName: string;
  clientAddress: string;
  clientCountry: string;
  invoiceAmount: Money;
  netRealisableValue: Money;
  contractRef: string | null;
  serviceDescription: string;
  sacCode: string;
}

declare const ready: unique symbol;
export type ReadyPack = PackDraft & { readonly [ready]: true; generatedAt: string; rows: EdfRow[] };

export const FLAG_THRESHOLD = 0.9;

export function assessPack(
  _draft: PackDraft,
  _now: Date,
): { ok: true; pack: ReadyPack } | { ok: false; blockers: Blocker[] } {
  throw new Error("not implemented");
}
