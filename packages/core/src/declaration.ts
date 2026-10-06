import { quarterLabel, quarterRange, type Quarter } from "./quarter";
import { FLAG_THRESHOLD } from "./readiness";
import { DECLARATION_LIMIT_INR, NEAR_LIMIT_BAND, REQUIRED_FIELDS } from "./types";
import type {
  AdBank,
  Allocation,
  ExporterProfile,
  InvoiceFacts,
  IsoDate,
  Money,
  PaymentFacts,
  YearMonth,
} from "./types";
import type { Realisation } from "./realisation";

export type ReductionChoice = "none" | "reduction" | "non_realisation";
export type DeclarationPeriod = Quarter | { invoiceId: string };

/**
 * One invoice the caller offers for the declaration.
 * PRECONDITION (caller's responsibility, not re-checked here): only invoices that were declared in a
 * SUBMITTED EDF pack at `draft.adBank`, and that are not already part of a submitted declaration.
 */
export interface DeclarationCandidate {
  invoice: InvoiceFacts;
  edfMonth: YearMonth; // month of the submitted EDF pack that declared the invoice
  realisation: Realisation;
  allocations: Allocation[]; // confirmed allocations for this invoice
  payments: PaymentFacts[]; // the payments those allocations point at
  reductionChoice: ReductionChoice;
}

export interface DeclarationDraft {
  period: DeclarationPeriod;
  adBank: AdBank;
  exporter: ExporterProfile;
  candidates: DeclarationCandidate[];
}

export type DeclarationBlocker =
  | { kind: "no_eligible_invoices" }
  | { kind: "missing_exporter_field"; field: string }
  | { kind: "missing_inr_equivalent"; invoiceId: string }
  | { kind: "flagged_inr_equivalent"; invoiceId: string; confidence: number }
  | { kind: "over_limit"; invoiceId: string; inrEquivalent: Money }
  | { kind: "unresolved_partial"; invoiceId: string };

export type DeclarationWarning =
  | { kind: "excluded_over_limit"; invoiceId: string; invoiceNo: string; inrEquivalent: Money }
  | { kind: "excluded_unresolved"; invoiceId: string; invoiceNo: string }
  | { kind: "excluded_no_payment_date"; invoiceId: string; invoiceNo: string }
  | { kind: "near_limit"; invoiceId: string; invoiceNo: string; inrEquivalent: Money };

export type DeclarationRowStatus = "realised_in_full" | "partly_realised_reduction" | "not_realised_reduction";

export interface DeclarationRow {
  invoiceId: string;
  invoiceNo: string;
  invoiceDate: IsoDate;
  edfMonth: YearMonth;
  clientName: string;
  currency: string;
  invoiceAmount: Money;
  inrEquivalent: Money;
  realisedAmount: Money;
  status: DeclarationRowStatus;
  evidence: { paymentDates: string; references: string; receiptModes: string };
}

/** Brand: the symbol is neither exported nor reachable, so the only way to obtain a ReadyDeclaration is `assessDeclaration`. */
declare const ready: unique symbol;
export type ReadyDeclaration = {
  readonly [ready]: true;
  period: DeclarationPeriod;
  periodLabel: string;
  adBank: AdBank;
  exporter: ExporterProfile;
  rows: DeclarationRow[];
  warnings: DeclarationWarning[];
  generatedAt: string;
};

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === "string" && v.trim() === "");

function need<T>(f: { value: T | null }, inv: InvoiceFacts, name: string): T {
  if (f.value === null) throw new Error(`assessDeclaration: invoice ${inv.id} ${name} unexpectedly null`);
  return f.value;
}

function confirmedPayments(c: DeclarationCandidate): PaymentFacts[] {
  const ids = new Set(
    c.allocations.filter((a) => a.invoiceId === c.invoice.id && a.status === "confirmed").map((a) => a.paymentId),
  );
  return c.payments
    .filter((p) => ids.has(p.id))
    .sort((a, b) => cmp(a.date.value ?? "", b.date.value ?? "") || cmp(a.id, b.id));
}

const MODE_LABEL = { local_transfer: "Local transfer", swift: "SWIFT" } as const;

function evidenceOf(payments: PaymentFacts[]): DeclarationRow["evidence"] {
  const dates: string[] = [];
  const refs: string[] = [];
  const modes: string[] = [];
  for (const p of payments) {
    const d = p.date.value;
    if (d && !dates.includes(d)) dates.push(d);
    const mode = p.receiptMode.value;
    const ref = !isEmpty(p.firaRef.value)
      ? (p.firaRef.value as string)
      : p.rail === "deel" && mode === "local_transfer"
        ? `Deel withdrawal${d ? ` ${d}` : ""}`
        : null;
    if (ref && !refs.includes(ref)) refs.push(ref);
    if (mode && !modes.includes(MODE_LABEL[mode])) modes.push(MODE_LABEL[mode]);
  }
  return { paymentDates: dates.join(", "), references: refs.join("; "), receiptModes: modes.join(", ") };
}

/**
 * Builds a ReadyDeclaration (Reg. 4(2) / Reg. 6 provisos: the bank MAY close or reduce on the
 * exporter's declaration). See `DeclarationCandidate` for the caller's precondition.
 *
 * Quarter period: realised invoices whose latest confirmed payment date falls in the quarter, plus
 * invoices with a reduction/non-realisation choice dated on or before quarter end. Over-limit and
 * unresolved invoices are excluded with a warning (unresolved only warns when dated on or before
 * quarter end). Single-invoice period: just that invoice; over-limit and unresolved are blockers.
 * Missing/flagged INR equivalents always block.
 * Blocker order: no_eligible_invoices, exporter fields, then per invoice (by id).
 */
export function assessDeclaration(
  draft: DeclarationDraft,
  now: Date,
): { ok: true; declaration: ReadyDeclaration } | { ok: false; blockers: DeclarationBlocker[] } {
  const single = typeof draft.period === "string" ? null : draft.period.invoiceId;
  const range = typeof draft.period === "string" ? quarterRange(draft.period) : null;

  const candidates = draft.candidates
    .filter((c) => single === null || c.invoice.id === single)
    .sort((a, b) => cmp(a.invoice.id, b.invoice.id));

  const invoiceBlockers: DeclarationBlocker[] = [];
  const warnings: DeclarationWarning[] = [];
  const rows: DeclarationRow[] = [];

  for (const c of candidates) {
    const inv = c.invoice;
    const id = inv.id;
    const invoiceNo = need(inv.invoiceNo, inv, "invoiceNo");
    const invoiceDate = need(inv.invoiceDate, inv, "invoiceDate");
    const payments = confirmedPayments(c);

    // 1. Is the invoice in scope for this period, and how would it be declared?
    let rowStatus: DeclarationRowStatus;
    if (c.realisation.status === "realised") {
      rowStatus = "realised_in_full";
      if (range) {
        let final: string | null = null;
        for (const p of payments) {
          const d = p.date.value;
          if (d && (final === null || d > final)) final = d;
        }
        if (final === null) {
          warnings.push({ kind: "excluded_no_payment_date", invoiceId: id, invoiceNo });
          continue;
        }
        if (final < range.start || final > range.end) continue; // belongs to another quarter
      }
    } else if (c.reductionChoice === "none") {
      if (range) {
        if (invoiceDate <= range.end) warnings.push({ kind: "excluded_unresolved", invoiceId: id, invoiceNo });
      } else {
        invoiceBlockers.push({ kind: "unresolved_partial", invoiceId: id });
      }
      continue;
    } else {
      if (range && invoiceDate > range.end) continue;
      rowStatus = c.reductionChoice === "reduction" ? "partly_realised_reduction" : "not_realised_reduction";
    }

    // 2. INR equivalent and the INR 10 lakh test.
    const inrF = inv.inrEquivalent;
    const inr = inrF.value;
    if (inr === null || inr.currency !== "INR") {
      invoiceBlockers.push({ kind: "missing_inr_equivalent", invoiceId: id });
      continue;
    }
    if (inrF.confidence < FLAG_THRESHOLD && inrF.source !== "user") {
      invoiceBlockers.push({ kind: "flagged_inr_equivalent", invoiceId: id, confidence: inrF.confidence });
      continue;
    }
    if (inr.minor > DECLARATION_LIMIT_INR) {
      if (single) invoiceBlockers.push({ kind: "over_limit", invoiceId: id, inrEquivalent: inr });
      else warnings.push({ kind: "excluded_over_limit", invoiceId: id, invoiceNo, inrEquivalent: inr });
      continue;
    }
    if (inr.minor >= NEAR_LIMIT_BAND.min && inr.minor <= NEAR_LIMIT_BAND.max) {
      warnings.push({ kind: "near_limit", invoiceId: id, invoiceNo, inrEquivalent: inr });
    }

    const amount = need(inv.amount, inv, "amount");
    rows.push({
      invoiceId: id,
      invoiceNo,
      invoiceDate,
      edfMonth: c.edfMonth,
      clientName: need(inv.clientName, inv, "clientName"),
      currency: amount.currency,
      invoiceAmount: amount,
      inrEquivalent: inr,
      realisedAmount: c.realisation.realised,
      status: rowStatus,
      evidence: evidenceOf(payments),
    });
  }

  const blockers: DeclarationBlocker[] = [];
  if (rows.length === 0 && invoiceBlockers.length === 0) blockers.push({ kind: "no_eligible_invoices" });
  for (const field of REQUIRED_FIELDS.exporter) {
    if (isEmpty(draft.exporter[field])) blockers.push({ kind: "missing_exporter_field", field });
  }
  blockers.push(...invoiceBlockers);
  if (blockers.length > 0) return { ok: false, blockers };

  rows.sort(
    (a, b) => cmp(a.invoiceDate, b.invoiceDate) || cmp(a.invoiceNo, b.invoiceNo) || cmp(a.invoiceId, b.invoiceId),
  );
  warnings.sort((a, b) => cmp(a.invoiceId, b.invoiceId) || cmp(a.kind, b.kind));
  const periodLabel =
    typeof draft.period === "string" ? quarterLabel(draft.period) : `Invoice ${rows[0]?.invoiceNo ?? draft.period.invoiceId}`;
  return {
    ok: true,
    declaration: {
      period: draft.period,
      periodLabel,
      adBank: draft.adBank,
      exporter: draft.exporter,
      rows,
      warnings,
      generatedAt: now.toISOString(),
    } as ReadyDeclaration,
  };
}
