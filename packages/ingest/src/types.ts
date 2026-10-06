import type { InvoiceFacts, IsoDate, Money, PaymentFacts, RailId } from "@korra/core";

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
