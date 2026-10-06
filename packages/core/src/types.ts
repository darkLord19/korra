export type Iso4217 = string; // "USD", "EUR", "INR"
export type IsoDate = string; // "2026-10-31"
export type YearMonth = string; // "2026-10"
export interface Money {
  minor: bigint;
  currency: Iso4217;
} // bigint, serialised as string at edges

export type RailId = "deel" | "generic";
export type ReceiptMode = "local_transfer" | "swift";

/** A value the ingester produced, or the user edited. */
export interface Field<T> {
  value: T | null;
  confidence: number; // 0..1. User-set values are 1.
  source: "extracted" | "user" | "default";
}

export interface InvoiceFacts {
  id: string;
  invoiceNo: Field<string>;
  invoiceDate: Field<IsoDate>;
  clientName: Field<string>;
  clientAddress: Field<string>;
  clientCountry: Field<string>; // ISO 3166-1 alpha-2
  amount: Field<Money>;
  netRealisableValue: Field<Money>;
  /** INR equivalent of the invoice amount. Optional for the EDF; required for declarations (₹10 lakh test). */
  inrEquivalent: Field<Money>;
  contractRef: Field<string>; // optional field
  serviceDescription: Field<string>;
  sacCode: Field<string>;
  adBankId: Field<string>; // which pack it goes to; defaults to the profile's default bank
}

export interface PaymentFacts {
  id: string;
  rail: RailId;
  receiptMode: Field<ReceiptMode>;
  date: Field<IsoDate>;
  foreignAmount: Field<Money>;
  inrCredited: Field<Money>;
  fxRate: Field<string>;
  fees: Field<Money>;
  firaRef: Field<string>;
  purposeCode: Field<string>; // e.g. "P0802"
  payerName: Field<string>; // client name as the rail reports it, for matching
  realisingBankName: Field<string>;
}

export interface Allocation {
  invoiceId: string;
  paymentId: string;
  amount: Money; // in the invoice currency
  score: number; // 0..1, from the matcher
  status: "proposed" | "confirmed" | "rejected";
}

/** An Authorised Dealer bank the exporter files EDFs with. */
export interface AdBank {
  id: string;
  name: string;
  adCode: string;
}

export interface ExporterProfile {
  legalName: string;
  address: string;
  pan: string;
  gstin: string;
  iec: string | null;
  defaultSacCodes: string[];
  defaultAdBankId: string;
}

/** Reg. 4(2)/6 provisos: a declaration may cover invoices up to INR 10 lakh (minor units: paise). */
export const DECLARATION_LIMIT_INR = 10_00_000_00n;
/** Invoices with an INR equivalent in this band (INR 9 lakh to 11 lakh, in paise) get a "confirm the INR equivalent" warning. */
export const NEAR_LIMIT_BAND = { min: 9_00_000_00n, max: 11_00_000_00n } as const;

/**
 * Single source of truth for required fields. Readiness checks and the review UI
 * both read this; do not keep separate copies.
 * `payment` is tracker-only: it never blocks an EDF pack (the EDF is an invoice declaration).
 * (firaRef is deliberately not required for payments: Deel local transfers have none.)
 */
export const REQUIRED_FIELDS = {
  invoice: [
    "invoiceNo",
    "invoiceDate",
    "clientName",
    "clientAddress",
    "clientCountry",
    "amount",
    "netRealisableValue",
    "serviceDescription",
    "sacCode",
    "adBankId",
  ],
  payment: ["receiptMode", "date", "foreignAmount", "purposeCode"],
  exporter: ["legalName", "address", "pan", "gstin", "defaultAdBankId"],
} as const satisfies {
  invoice: readonly (keyof InvoiceFacts)[];
  payment: readonly (keyof PaymentFacts)[];
  exporter: readonly (keyof ExporterProfile)[];
};
