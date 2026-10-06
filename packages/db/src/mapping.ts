import type { Allocation, Field, InvoiceFacts, Money, PaymentFacts } from "@korra/core";
import type { StoredField } from "./schema";
import type { allocation, invoice, payment } from "./schema";

/** Fields of InvoiceFacts / PaymentFacts that are `Field<...>` (everything except id and rail). */
export const INVOICE_FIELDS = [
  "invoiceNo",
  "invoiceDate",
  "clientName",
  "clientAddress",
  "clientCountry",
  "amount",
  "netRealisableValue",
  "contractRef",
  "serviceDescription",
  "sacCode",
  "adBankId",
] as const satisfies readonly (keyof InvoiceFacts)[];

export const PAYMENT_FIELDS = [
  "receiptMode",
  "date",
  "foreignAmount",
  "inrCredited",
  "fxRate",
  "fees",
  "firaRef",
  "purposeCode",
  "payerName",
  "realisingBankName",
] as const satisfies readonly (keyof PaymentFacts)[];

export type InvoiceFieldName = (typeof INVOICE_FIELDS)[number];
export type PaymentFieldName = (typeof PAYMENT_FIELDS)[number];
export type FieldValue<F> = F extends Field<infer T> ? T | null : never;

const MONEY_FIELDS = new Set<string>(["amount", "netRealisableValue", "foreignAmount", "inrCredited", "fees"]);

export function toStoredField(name: string, f: Field<unknown>): StoredField {
  let value = f.value;
  if (value !== null && MONEY_FIELDS.has(name)) {
    const m = value as Money;
    value = { minor: m.minor.toString(), currency: m.currency };
  }
  return { value, confidence: f.confidence, source: f.source };
}

export function fromStoredField(name: string, s: StoredField): Field<unknown> {
  let value = s.value;
  if (value !== null && MONEY_FIELDS.has(name)) {
    const j = value as { minor: string; currency: string };
    value = { minor: BigInt(j.minor), currency: j.currency } satisfies Money;
  }
  return { value, confidence: s.confidence, source: s.source };
}

/** `month` (YYYY-MM) from an ISO date value, or null. */
export function monthOf(date: unknown): string | null {
  return typeof date === "string" && /^\d{4}-\d{2}/.test(date) ? date.slice(0, 7) : null;
}

/** Drizzle column key for a facts field. `adBankId` is stored in `adBankIdField` (see schema). */
export const invoiceColumn = (f: InvoiceFieldName) => (f === "adBankId" ? "adBankIdField" : f);

type InvoiceRow = typeof invoice.$inferSelect;
type PaymentRow = typeof payment.$inferSelect;

export function invoiceFromRow(r: InvoiceRow): InvoiceFacts {
  // inrEquivalent has no column yet (added with the declarations migration): default until then.
  const out: Record<string, unknown> = { id: r.id, inrEquivalent: { value: null, confidence: 0, source: "default" } };
  for (const f of INVOICE_FIELDS) out[f] = fromStoredField(f, r[invoiceColumn(f)]);
  return out as unknown as InvoiceFacts;
}

export function invoiceToColumns(facts: Omit<InvoiceFacts, "id">) {
  const cols: Record<string, StoredField> = {};
  for (const f of INVOICE_FIELDS) cols[invoiceColumn(f)] = toStoredField(f, facts[f]);
  return cols;
}

export function paymentFromRow(r: PaymentRow): PaymentFacts {
  const out: Record<string, unknown> = { id: r.id, rail: r.rail };
  for (const f of PAYMENT_FIELDS) out[f] = fromStoredField(f, r[f]);
  return out as unknown as PaymentFacts;
}

export function paymentToColumns(facts: Omit<PaymentFacts, "id" | "rail">) {
  const cols: Record<string, StoredField> = {};
  for (const f of PAYMENT_FIELDS) cols[f] = toStoredField(f, facts[f]);
  return cols;
}

export function allocationFromRow(r: typeof allocation.$inferSelect): Allocation {
  return {
    invoiceId: r.invoiceId,
    paymentId: r.paymentId,
    amount: { minor: BigInt(r.amountMinor), currency: r.currency },
    score: r.score,
    status: r.status,
  };
}
