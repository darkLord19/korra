/**
 * Wire types: what use-cases hand to apps/web. No bigint, no Date (ISO strings), plain JSON.
 * Type-only module (safe to `import type` from client components).
 */
import type { AdBank, Allocation, Blocker, ExporterProfile, InvoiceFacts, PaymentFacts, Realisation } from "@korra/core";

/** bigint -> string, Date -> string, recursively. */
export type Wire<T> = T extends bigint
  ? string
  : T extends Date
    ? string
    : T extends readonly (infer U)[]
      ? Wire<U>[]
      : T extends object
        ? { [K in keyof T]: Wire<T[K]> }
        : T;

export type MoneyWire = { minor: string; currency: string };
export type InvoiceWire = Wire<InvoiceFacts> & { documentId: string | null };
export type PaymentWire = Wire<PaymentFacts> & { documentId: string | null; nocDocumentId: string | null };
export type AllocationWire = Wire<Allocation>;
export type RealisationWire = Wire<Realisation>;
export type BlockerWire = Blocker;
export type AdBankWire = AdBank;
export type ExporterProfileWire = ExporterProfile;

export interface DocumentWire {
  id: string;
  kind: "invoice" | "statement" | "fira" | "noc" | "ack" | "unknown" | null;
  month: string | null;
  filename: string;
  mimeType: string;
  status: "uploaded" | "ingesting" | "ingested" | "failed";
  attempts: number;
  error: string | null;
  createdAt: string;
  /** Months of invoices read from this document, by invoice date (not upload month). */
  invoiceMonths: string[];
}

export interface PackWire {
  id: string;
  month: string;
  adBankId: string;
  layoutId: string;
  status: "generated" | "submitted";
  files: { name: string; mimeType: string }[];
  generatedAt: string;
  submittedAt: string | null;
}

export interface OnboardingWire {
  profile: ExporterProfileWire | null;
  banks: AdBankWire[];
  complete: boolean;
}

/** What an invoice says about its issuer (the exporter), to pre-fill the profile form. Every value is a suggestion; null = not found. */
export interface ProfileSuggestionWire {
  legalName: string | null;
  address: string | null;
  gstin: string | null;
  /** From the GSTIN when there is one. */
  pan: string | null;
  sacCode: string | null;
  /** `key` of the BANK_CATALOG bank the invoice's IFSC or bank name points to. */
  bankKey: string | null;
  /** A bank name that is not in the catalog (the form offers it under "Other bank"). */
  otherBankName: string | null;
  /** Month ("YYYY-MM") of the invoice date, for filing the invoice itself. */
  invoiceMonth: string | null;
}

export interface ManualEntryResult {
  id: string;
}

export interface ConfirmAllFieldsResult {
  entity: "invoice" | "payment";
  id: string;
  /** Names of the fields that were changed (each has a field_edit audit row). Empty when nothing needed confirming. */
  changed: string[];
}

export interface RequestUploadResult {
  documentId: string;
  uploadUrl: string;
  token: string;
}

export interface MonthStateWire {
  month: string;
  documents: DocumentWire[];
  invoices: InvoiceWire[];
  payments: PaymentWire[];
  allocations: AllocationWire[];
  /** By invoice id. Only invoices that have a date and an amount. */
  realisations: Record<string, RealisationWire>;
  /** `placeholderLayout`: the bank has no official EDF format yet, so its pack uses a stand-in layout. */
  blockersByBank: { adBankId: string; adBankName: string; blockers: BlockerWire[]; placeholderLayout: boolean }[];
  pendingDocumentIds: string[];
  /** SAC code of the owner's most recent invoice that has one: the by-hand invoice form starts with it. */
  lastSacCode: string | null;
}

export type GeneratePackResult =
  | { ok: true; packId: string; layoutId: string; placeholder: boolean }
  | { ok: false; blockers: BlockerWire[] };

export interface PackDownloadsWire {
  pack: PackWire;
  placeholder: boolean;
  files: { name: string; mimeType: string; url: string }[];
}

export interface TrackerRowWire {
  invoice: InvoiceWire;
  realisation: RealisationWire;
}

export interface TrackerWire {
  asOf: string;
  /** Per currency. `outstanding` covers every non-realised invoice (overdue ones included). */
  totals: { outstanding: MoneyWire[]; due60: MoneyWire[]; overdue: MoneyWire[] };
  rows: TrackerRowWire[];
}

export interface CaShareWire {
  id: string;
  caEmail: string;
  status: "invited" | "accepted" | "revoked";
  createdAt: string;
  acceptedAt: string | null;
}

/** An invite as the invited person sees it on the accept page. */
export interface CaInviteWire {
  ownerUserId: string;
  ownerName: string;
  caEmail: string;
  status: "invited" | "accepted" | "revoked";
  /** The signed-in user's email is the one that was invited. */
  emailMatches: boolean;
  /** The signed-in user is the one who sent it. */
  isOwner: boolean;
}

export interface CaClientWire {
  shareId: string;
  ownerUserId: string;
  ownerName: string;
  ownerEmail: string;
  acceptedAt: string | null;
}

export interface NotificationRunResult {
  sent: number;
  skipped: number;
  failed: number;
}

export interface SweepResult {
  requeued: number;
  failed: number;
}
