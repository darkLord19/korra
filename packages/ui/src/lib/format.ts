import { formatMoney, moneyFromJSON, type MoneyJSON } from "@korra/core";

export type MoneyWire = MoneyJSON;

export const money = (m: MoneyWire | null | undefined): string => (m ? formatMoney(moneyFromJSON(m)) : "");

/** "2026-10" -> "October 2026" */
export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
}

export function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split("-").map(Number);
  const idx = y! * 12 + (m! - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

/** "2026-11-30" -> "30 Nov 2026" */
export function dateLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!)).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/** Current year-month in India (the product's calendar). */
export function currentMonthIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit" }).format(now).slice(0, 7);
}

/** Today's date in India, YYYY-MM-DD. */
export function todayIST(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Sums money per currency (first-seen currency order). */
export function sumMoney(amounts: MoneyWire[]): MoneyWire[] {
  const sums = new Map<string, bigint>();
  for (const a of amounts) sums.set(a.currency, (sums.get(a.currency) ?? 0n) + BigInt(a.minor));
  return [...sums.entries()].map(([currency, minor]) => ({ currency, minor: minor.toString() }));
}

export const FIELD_LABELS: Record<string, string> = {
  invoiceNo: "Invoice number", invoiceDate: "Invoice date", clientName: "Client name", clientAddress: "Client address",
  clientCountry: "Client country", amount: "Invoice amount", netRealisableValue: "Net realisable value",
  contractRef: "Contract reference", serviceDescription: "Service description", sacCode: "SAC code", adBankId: "AD bank",
  receiptMode: "Receipt mode", date: "Date", foreignAmount: "Foreign amount", inrCredited: "INR credited", fxRate: "FX rate",
  fees: "Fees", firaRef: "FIRA reference", purposeCode: "Purpose code", payerName: "Payer", realisingBankName: "Realising bank",
  legalName: "Legal name", address: "Address", pan: "PAN", gstin: "GSTIN", defaultAdBankId: "Default AD bank",
};

const COMPANY_WORDS = new Set(["pvt", "private", "ltd", "limited", "llp", "llc", "inc", "corp", "corporation", "co", "company", "opc", "m/s"]);

/**
 * The name to greet: the legal name's first word in title case ("JANE DEV CONSULTING" -> "Jane"), or null when that word
 * is only a company suffix ("PVT LTD ..."). A word that already mixes cases ("McDonald") is kept as typed.
 */
export function greetingName(legalName: string | null | undefined): string | null {
  const word = legalName?.trim().split(/\s+/)[0]?.replace(/[^\p{L}\p{M}'’-]+$/u, "");
  if (!word || COMPANY_WORDS.has(word.toLowerCase())) return null;
  return word === word.toUpperCase() || word === word.toLowerCase() ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : word;
}

/** A field label inside a sentence: "Invoice number" -> "invoice number", while "SAC code" and "AD bank" keep their capitals. */
export const midSentence = (label: string): string => (/^\p{Lu}\p{Ll}/u.test(label) ? label.charAt(0).toLowerCase() + label.slice(1) : label);

/** Whole days from `from` to `to` (ISO dates); negative when `to` is earlier. */
export const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
