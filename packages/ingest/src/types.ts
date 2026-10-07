import type { Field, InvoiceFacts, IsoDate, Money, PaymentFacts, RailId } from "@korra/core";

/** Who issued an invoice (the exporter): what the onboarding form asks for. Parse-only; never stored with the invoice. */
export interface IssuerFacts {
  legalName: Field<string>;
  address: Field<string>;
  gstin: Field<string>;
  /** From the GSTIN (its characters 3 to 12), or printed next to a "PAN" label. */
  pan: Field<string>;
  sacCode: Field<string>;
  ifsc: Field<string>;
  /** The exporter's bank, as printed. */
  bankName: Field<string>;
}

export interface IngestDoc {
  bytes: Uint8Array;
  mimeType: string;
  filename: string;
  hint?: "invoice" | "statement" | "fira" | "noc";
}

export interface IngestResult {
  kind: "invoice" | "statement" | "fira" | "noc" | "unknown";
  /** Set when kind === "noc"; used to link the NOC to a payment. */
  nocRef?: { reference: string | null; amount: Money | null; date: IsoDate | null };
  rail: RailId | null;
  invoices: Omit<InvoiceFacts, "id" | "adBankId">[];
  payments: Omit<PaymentFacts, "id">[];
  /** Set for invoices by extractors that can read the issuer. */
  issuer?: IssuerFacts;
  warnings: string[];
}

/** Internal seam: turns a PDF/image into an IngestResult. */
export interface LlmExtractor {
  extract(doc: IngestDoc): Promise<IngestResult>;
}

/** Thrown when extraction fails. `retryable` tells the job runner whether a retry can help. */
export class IngestError extends Error {
  readonly retryable: boolean;
  readonly code: string;
  constructor(message: string, opts: { retryable: boolean; code: string; cause?: unknown }) {
    super(message, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "IngestError";
    this.retryable = opts.retryable;
    this.code = opts.code;
  }
}
