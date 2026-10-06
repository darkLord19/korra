import { REQUIRED_FIELDS } from "./types";
import type {
  AdBank,
  ExporterProfile,
  Field,
  InvoiceFacts,
  IsoDate,
  Money,
  YearMonth,
} from "./types";
import { yearMonthOf } from "./dates";

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

/**
 * Brand: the symbol is neither exported nor reachable, so the only way to obtain a
 * ReadyPack is `assessPack`.
 */
declare const ready: unique symbol;
export type ReadyPack = PackDraft & { readonly [ready]: true; generatedAt: string; rows: EdfRow[] };

export const FLAG_THRESHOLD = 0.9;

/** Optional invoice fields: never block when empty, but block when flagged with a value. */
const OPTIONAL_INVOICE_FIELDS = ["contractRef"] as const satisfies readonly (keyof InvoiceFacts)[];

function isEmpty(v: unknown): boolean {
  return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
}

function isFlagged(field: Field<unknown>): boolean {
  return field.confidence < FLAG_THRESHOLD && field.source !== "user";
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function toRow(draft: PackDraft, inv: InvoiceFacts): EdfRow {
  const need = <T>(field: Field<T>, name: string): T => {
    if (field.value === null) throw new Error(`assessPack: invoice ${inv.id} ${name} unexpectedly null`);
    return field.value;
  };
  const ex = draft.exporter;
  return {
    exporterLegalName: ex.legalName,
    exporterAddress: ex.address,
    exporterPan: ex.pan,
    exporterGstin: ex.gstin,
    exporterIec: ex.iec,
    invoiceNo: need(inv.invoiceNo, "invoiceNo"),
    invoiceDate: need(inv.invoiceDate, "invoiceDate"),
    clientName: need(inv.clientName, "clientName"),
    clientAddress: need(inv.clientAddress, "clientAddress"),
    clientCountry: need(inv.clientCountry, "clientCountry"),
    invoiceAmount: need(inv.amount, "amount"),
    netRealisableValue: need(inv.netRealisableValue, "netRealisableValue"),
    contractRef: isEmpty(inv.contractRef.value) ? null : inv.contractRef.value,
    serviceDescription: need(inv.serviceDescription, "serviceDescription"),
    sacCode: need(inv.sacCode, "sacCode"),
  };
}

/**
 * Readiness depends only on the exporter profile and the draft's invoices: those dated in
 * `draft.month` (or undated, which blocks) filed with `draft.adBank` (or with no bank yet, which blocks). Payments never block. Blockers are listed in a stable order:
 * no_invoices, exporter fields, invoice fields (by id; missing before flagged per field
 * order), pending documents.
 */
export function assessPack(
  draft: PackDraft,
  now: Date,
): { ok: true; pack: ReadyPack } | { ok: false; blockers: Blocker[] } {
  const blockers: Blocker[] = [];

  const included = draft.invoices
    .filter((inv) => {
      const bankOk = inv.adBankId.value === null || inv.adBankId.value === draft.adBank.id;
      if (!bankOk) return false;
      const d = inv.invoiceDate.value;
      // An undated invoice the caller put in this month's draft must block (missing invoiceDate),
      // never be silently dropped: dropping it could leave an export undeclared.
      return d === null || yearMonthOf(d) === draft.month;
    })
    .sort((a, b) => cmp(a.id, b.id));

  if (included.length === 0) blockers.push({ kind: "no_invoices" });

  for (const field of REQUIRED_FIELDS.exporter) {
    if (isEmpty(draft.exporter[field])) {
      blockers.push({ kind: "missing_field", entity: "exporter", id: "", field });
    }
  }

  for (const inv of included) {
    for (const field of REQUIRED_FIELDS.invoice) {
      const fld = inv[field] as Field<unknown>;
      if (isEmpty(fld.value)) {
        blockers.push({ kind: "missing_field", entity: "invoice", id: inv.id, field });
      } else if (isFlagged(fld)) {
        blockers.push({ kind: "flagged_field", entity: "invoice", id: inv.id, field, confidence: fld.confidence });
      }
    }
    for (const field of OPTIONAL_INVOICE_FIELDS) {
      const fld = inv[field] as Field<unknown>;
      if (!isEmpty(fld.value) && isFlagged(fld)) {
        blockers.push({ kind: "flagged_field", entity: "invoice", id: inv.id, field, confidence: fld.confidence });
      }
    }
  }

  for (const documentId of draft.pendingDocumentIds) {
    blockers.push({ kind: "document_pending", documentId });
  }

  if (blockers.length > 0) return { ok: false, blockers };

  const rows = included
    .map((inv) => toRow(draft, inv))
    .sort((a, b) => cmp(a.invoiceDate, b.invoiceDate) || cmp(a.invoiceNo, b.invoiceNo));

  return { ok: true, pack: { ...draft, generatedAt: now.toISOString(), rows } as ReadyPack };
}
