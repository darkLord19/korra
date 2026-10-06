/**
 * Zod input schemas for every use-case. Pure (zod + core only): no db, no server-only, so client
 * components and forms may import them. Use-cases parse their own input with these too.
 */
import { z } from "zod";
import type { Money } from "@korra/core";

export const ALLOWED_UPLOAD_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
] as const;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

const id = z.string().trim().min(1);
const trimmed = z.string().trim().min(1);
export const yearMonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected YYYY-MM");
export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").refine((s) => !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().startsWith(s), "Not a real date");
const currencySchema = z.string().regex(/^[A-Z]{3}$/, "Expected an ISO 4217 code like USD");

/** Money as it crosses the wire: minor units as a decimal string. */
export const moneyWireSchema = z.object({ minor: z.string().regex(/^\d+$/, "Expected whole minor units"), currency: currencySchema });

/* ----------------------------- onboarding ----------------------------- */

export const saveProfileInput = z.object({
  legalName: trimmed,
  address: trimmed,
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}\d{4}[A-Z]$/, "PAN looks like ABCDE1234F"),
  gstin: z.string().trim().toUpperCase().regex(/^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/, "GSTIN has 15 characters"),
  iec: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{10}$/, "IEC has 10 characters").nullish().transform((v) => v ?? null),
  defaultSacCodes: z.array(z.string().trim().regex(/^\d{4,8}$/, "SAC code is 4 to 8 digits")).default([]),
  defaultAdBankId: id,
});
export type SaveProfileInput = z.input<typeof saveProfileInput>;

export const saveBankInput = z.object({ id: id.optional(), name: trimmed, adCode: trimmed });
export type SaveBankInput = z.input<typeof saveBankInput>;

/* ------------------------------- uploads ------------------------------- */

export const requestUploadInput = z.object({
  filename: z.string().trim().min(1).max(255),
  mimeType: z.enum(ALLOWED_UPLOAD_MIME_TYPES),
  /** Client-declared; re-checked against the stored blob during ingest. */
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES, "Files are limited to 20 MB"),
  month: yearMonthSchema,
  hint: z.enum(["invoice", "statement", "fira", "noc"]).optional(),
});
export type RequestUploadInput = z.input<typeof requestUploadInput>;

export const confirmUploadInput = id;
export const getMonthStateInput = yearMonthSchema;

/* ----------------------------- review & match ----------------------------- */

export const INVOICE_FIELD_NAMES = [
  "invoiceNo", "invoiceDate", "clientName", "clientAddress", "clientCountry", "amount",
  "netRealisableValue", "contractRef", "serviceDescription", "sacCode", "adBankId",
] as const;
export const PAYMENT_FIELD_NAMES = [
  "receiptMode", "date", "foreignAmount", "inrCredited", "fxRate", "fees", "firaRef",
  "purposeCode", "payerName", "realisingBankName",
] as const;

export const editFieldInput = z.object({
  entity: z.enum(["invoice", "payment"]),
  id,
  field: z.string().min(1),
  /** Strings, ISO dates, or Money as { minor: string, currency }. null clears the value. */
  value: z.unknown(),
});
export type EditFieldInput = z.input<typeof editFieldInput>;

type Kind = "text" | "date" | "money" | "country" | "decimal" | "receiptMode" | "bankId";
const INVOICE_KINDS: Record<(typeof INVOICE_FIELD_NAMES)[number], Kind> = {
  invoiceNo: "text", invoiceDate: "date", clientName: "text", clientAddress: "text", clientCountry: "country",
  amount: "money", netRealisableValue: "money", contractRef: "text", serviceDescription: "text", sacCode: "text", adBankId: "bankId",
};
const PAYMENT_KINDS: Record<(typeof PAYMENT_FIELD_NAMES)[number], Kind> = {
  receiptMode: "receiptMode", date: "date", foreignAmount: "money", inrCredited: "money", fxRate: "decimal",
  fees: "money", firaRef: "text", purposeCode: "text", payerName: "text", realisingBankName: "text",
};

const KIND_SCHEMAS: Record<Kind, z.ZodType<unknown>> = {
  text: z.string().trim().max(2000),
  date: isoDateSchema,
  money: moneyWireSchema,
  country: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Expected a 2-letter country code like US"),
  decimal: z.string().trim().regex(/^\d+(\.\d+)?$/, "Expected a decimal number"),
  receiptMode: z.enum(["local_transfer", "swift"]),
  bankId: id,
};

export class FieldValueError extends Error {
  override name = "FieldValueError";
}

/**
 * Validates `value` for a known field and converts it to what the repositories take
 * (Money -> bigint minor; empty string / null -> null). Throws FieldValueError.
 */
export function parseFieldValue(entity: "invoice" | "payment", field: string, value: unknown): unknown {
  const kinds: Record<string, Kind> = entity === "invoice" ? INVOICE_KINDS : PAYMENT_KINDS;
  const kind = kinds[field];
  if (!kind) throw new FieldValueError(`Unknown ${entity} field: ${field}`);
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const r = KIND_SCHEMAS[kind].safeParse(value);
  if (!r.success) throw new FieldValueError(`${field}: ${r.error.issues[0]?.message ?? "invalid value"}`);
  if (kind === "money") {
    const m = r.data as { minor: string; currency: string };
    return { minor: BigInt(m.minor), currency: m.currency } satisfies Money;
  }
  return r.data;
}

/** Fields whose edit can change matching. */
export const MATCH_AFFECTING_FIELDS = {
  invoice: ["amount", "invoiceDate", "clientName"],
  payment: ["foreignAmount", "date", "payerName"],
} as const;

export const decideAllocationInput = z.object({
  invoiceId: id,
  paymentId: id,
  decision: z.enum(["confirm", "reject"]),
});
export type DecideAllocationInput = z.input<typeof decideAllocationInput>;

export const linkNocInput = z.object({ paymentId: id, documentId: id });

/* -------------------------------- packs -------------------------------- */

export const generatePackInput = z.object({ month: yearMonthSchema, adBankId: id });
export const getPackDownloadsInput = id;
export const markPackSubmittedInput = z.object({ packId: id, ackDocumentId: id.optional() });

/* --------------------------------- CA --------------------------------- */

export const inviteCaInput = z.string().trim().toLowerCase().pipe(z.email());
export const acceptCaInviteInput = id;
export const revokeCaInput = id;

/* ------------------------- parameterless use-cases ------------------------- */

/** Documented for completeness: these take no input. */
export const getOnboardingInput = z.undefined();
export const getTrackerInput = z.undefined();
export const listCaClientsInput = z.undefined();
export const listMyCasInput = z.undefined();
export const deleteAccountInput = z.undefined();
export const runIngestInput = id;
export const sweepStuckIngestsInput = z.undefined();
export const runDailyNotificationsInput = z.undefined();
