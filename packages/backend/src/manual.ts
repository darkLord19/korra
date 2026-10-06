// Manual entry: the user types an invoice or payment themselves (scanned PDFs, images, or fields the local
// extractor missed), and "I've checked these" (confirmAllFields). Isomorphic like the other use-cases.
import type { Field, InvoiceFacts, PaymentFacts } from "@korra/core";
import type { DocumentRecord, Repos } from "@korra/db";
import type { Ctx } from "./deps-types";
import { ValidationError } from "./errors";
import {
  FieldValueError,
  INVOICE_FIELD_NAMES,
  PAYMENT_FIELD_NAMES,
  confirmAllFieldsInput,
  createInvoiceManuallyInput,
  createPaymentManuallyInput,
  parseFieldValue,
  type ConfirmAllFieldsInput,
  type CreateInvoiceManuallyInput,
  type CreatePaymentManuallyInput,
} from "./inputs";
import { parse, rematch, repos, requireOwner } from "./internal";
import type { ConfirmAllFieldsResult, ManualEntryResult } from "./wire-types";

const userField = <T>(value: T | null): Field<T> =>
  value === null ? { value: null, confidence: 0, source: "default" } : { value, confidence: 1, source: "user" };

/** Validates every supplied field with the same rules as `editField`; unknown names are rejected. */
function parseFields(entity: "invoice" | "payment", names: readonly string[], raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(raw)) {
    if (!names.includes(name)) throw new ValidationError(`Unknown ${entity} field: ${name}`);
    try {
      out[name] = parseFieldValue(entity, name, value);
    } catch (e) {
      if (e instanceof FieldValueError) throw new ValidationError(e.message);
      throw e;
    }
  }
  return out;
}

const monthOf = (isoDate: unknown): string | null => (typeof isoDate === "string" ? isoDate.slice(0, 7) : null);

/** The typed-in document now has its records: it is no longer a failed or unrecognised upload. */
async function markHandled(r: Repos, doc: DocumentRecord, kind: "invoice" | null): Promise<void> {
  if (kind && (doc.kind === null || doc.kind === "unknown")) await r.documents.setKind(doc.id, kind);
  if (doc.status === "failed") await r.documents.setStatus(doc.id, "ingested");
}

export async function createInvoiceManually(ctx: Ctx, raw: CreateInvoiceManuallyInput): Promise<ManualEntryResult> {
  requireOwner(ctx);
  const input = parse(createInvoiceManuallyInput, raw);
  const values = parseFields("invoice", INVOICE_FIELD_NAMES, input.fields);
  const r = repos(ctx);

  const doc = input.documentId ? await r.documents.get(input.documentId) : null; // NotFound unless it is theirs
  const invoiceMonth = monthOf(values.invoiceDate) ?? doc?.month ?? null;
  if (invoiceMonth === null) throw new ValidationError("An invoice date is required when the invoice is not typed from an uploaded document.");
  if (invoiceMonth !== input.month) throw new ValidationError(`This invoice belongs to ${invoiceMonth}, not ${input.month}.`);

  const banks = await r.banks.list();
  const supplied = values.adBankId;
  if (typeof supplied === "string" && !banks.some((b) => b.id === supplied)) throw new ValidationError("Unknown AD bank");
  const defaultBank = (await r.profile.get())?.defaultAdBankId ?? null;

  const get = <K extends (typeof INVOICE_FIELD_NAMES)[number]>(k: K) => userField((values[k] ?? null) as never);
  const facts: Omit<InvoiceFacts, "id"> = {
    invoiceNo: get("invoiceNo"),
    invoiceDate: get("invoiceDate"),
    clientName: get("clientName"),
    clientAddress: get("clientAddress"),
    clientCountry: get("clientCountry"),
    amount: get("amount"),
    netRealisableValue: get("netRealisableValue"),
    inrEquivalent: { value: null, confidence: 0, source: "default" },
    contractRef: get("contractRef"),
    serviceDescription: get("serviceDescription"),
    sacCode: get("sacCode"),
    adBankId:
      typeof supplied === "string"
        ? userField(supplied)
        : { value: defaultBank, confidence: defaultBank ? 1 : 0, source: "default" },
  };
  const [id] = await r.invoices.insertExtracted(doc?.id ?? null, [facts]);
  if (doc) await markHandled(r, doc, "invoice");
  await rematch(r);
  return { id: id! };
}

export async function createPaymentManually(ctx: Ctx, raw: CreatePaymentManuallyInput): Promise<ManualEntryResult> {
  requireOwner(ctx);
  const input = parse(createPaymentManuallyInput, raw);
  const values = parseFields("payment", PAYMENT_FIELD_NAMES, input.fields);
  // A payment is listed under the month of its date, so without one it would vanish from every month.
  if (monthOf(values.date) === null) throw new ValidationError("A payment date is required.");
  const r = repos(ctx);

  const doc = input.documentId ? await r.documents.get(input.documentId) : null;
  const get = <K extends (typeof PAYMENT_FIELD_NAMES)[number]>(k: K) => userField((values[k] ?? null) as never);
  const facts: Omit<PaymentFacts, "id"> = {
    rail: "generic",
    receiptMode: get("receiptMode"),
    date: get("date"),
    foreignAmount: get("foreignAmount"),
    inrCredited: get("inrCredited"),
    fxRate: get("fxRate"),
    fees: get("fees"),
    firaRef: get("firaRef"),
    purposeCode: get("purposeCode"),
    payerName: get("payerName"),
    realisingBankName: get("realisingBankName"),
  };
  const [id] = await r.payments.insertExtracted(doc?.id ?? null, [facts]);
  if (doc) await markHandled(r, doc, null);
  await rematch(r);
  return { id: id! };
}

/**
 * "I've checked these": marks every non-null field of an invoice or payment as user-set (confidence 1),
 * with one field_edit audit row (old and new) per field that actually changed. Owner only.
 */
export async function confirmAllFields(ctx: Ctx, raw: ConfirmAllFieldsInput): Promise<ConfirmAllFieldsResult> {
  requireOwner(ctx);
  const input = parse(confirmAllFieldsInput, raw);
  const r = repos(ctx);
  const changed: string[] = [];
  if (input.entity === "invoice") {
    const facts = await r.invoices.get(input.id);
    for (const name of INVOICE_FIELD_NAMES) {
      const fld = facts[name] as Field<unknown>;
      if (fld.value === null || (fld.source === "user" && fld.confidence === 1)) continue;
      await r.invoices.updateField(input.id, name, fld.value as never);
      changed.push(name);
    }
  } else {
    const facts = await r.payments.get(input.id);
    for (const name of PAYMENT_FIELD_NAMES) {
      const fld = facts[name] as Field<unknown>;
      if (fld.value === null || (fld.source === "user" && fld.confidence === 1)) continue;
      await r.payments.updateField(input.id, name, fld.value as never);
      changed.push(name);
    }
  }
  return { entity: input.entity, id: input.id, changed };
}
