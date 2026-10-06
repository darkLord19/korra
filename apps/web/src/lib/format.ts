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

export const FIELD_LABELS: Record<string, string> = {
  invoiceNo: "Invoice number", invoiceDate: "Invoice date", clientName: "Client name", clientAddress: "Client address",
  clientCountry: "Client country", amount: "Invoice amount", netRealisableValue: "Net realisable value",
  contractRef: "Contract reference", serviceDescription: "Service description", sacCode: "SAC code", adBankId: "AD bank",
  receiptMode: "Receipt mode", date: "Date", foreignAmount: "Foreign amount", inrCredited: "INR credited", fxRate: "FX rate",
  fees: "Fees", firaRef: "FIRA reference", purposeCode: "Purpose code", payerName: "Payer", realisingBankName: "Realising bank",
  legalName: "Legal name", address: "Address", pan: "PAN", gstin: "GSTIN", defaultAdBankId: "Default AD bank",
};
