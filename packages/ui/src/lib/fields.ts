import { FLAG_THRESHOLD } from "@korra/core";
import type { InvoiceWire } from "@korra/backend/schemas";

export interface FieldData { value: unknown; confidence: number; source: "extracted" | "user" | "default" }
export type FieldKind = "text" | "date" | "money" | "country" | "decimal" | "receiptMode" | "bankId";

/** Presentation only: the backend's readiness check is what actually blocks a pack. */
export const needsCheck = (f: FieldData) => f.value !== null && f.confidence < FLAG_THRESHOLD && f.source !== "user";

/** The invoice fields shown (and checked for "needs a look"), in display order. */
export const INVOICE_FIELDS: { name: keyof InvoiceWire & string; kind: FieldKind }[] = [
  { name: "invoiceNo", kind: "text" }, { name: "invoiceDate", kind: "date" }, { name: "clientName", kind: "text" },
  { name: "clientAddress", kind: "text" }, { name: "clientCountry", kind: "country" }, { name: "amount", kind: "money" },
  { name: "netRealisableValue", kind: "money" }, { name: "serviceDescription", kind: "text" }, { name: "sacCode", kind: "text" },
  { name: "contractRef", kind: "text" }, { name: "adBankId", kind: "bankId" },
];

/** How many of an invoice's fields are flagged for a look. */
export const flaggedCount = (inv: InvoiceWire) => INVOICE_FIELDS.filter((f) => needsCheck(inv[f.name] as never)).length;

export const RECEIPT_MODES = { local_transfer: "Local transfer", swift: "SWIFT" } as const;
