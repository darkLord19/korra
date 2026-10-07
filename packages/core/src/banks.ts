/** An Authorised Dealer bank a user can pick by name. The name keeps "HDFC", "ICICI" and "Axis" so pack layout detection by name still works. */
export interface BankCatalogEntry {
  key: string;
  name: string;
  /** A published AD code to suggest (never to fill in). Only where the bank itself publishes one. */
  adCodeHint?: string;
}

export const BANK_CATALOG: readonly BankCatalogEntry[] = [
  { key: "hdfc", name: "HDFC Bank" },
  { key: "icici", name: "ICICI Bank", adCodeHint: "6390002" },
  { key: "axis", name: "Axis Bank" },
  { key: "sbi", name: "State Bank of India" },
  { key: "kotak", name: "Kotak Mahindra Bank" },
  { key: "yes", name: "Yes Bank" },
  { key: "idfc-first", name: "IDFC FIRST Bank" },
  { key: "indusind", name: "IndusInd Bank" },
  { key: "bob", name: "Bank of Baroda" },
  { key: "pnb", name: "Punjab National Bank" },
];

/** The select value for a bank that is not in the catalog (the user types its name). */
export const OTHER_BANK_KEY = "other";

/** The catalog entry whose name matches (trimmed, case-insensitive), if any. */
export function findCatalogBank(name: string): BankCatalogEntry | undefined {
  const n = name.trim().toLowerCase();
  return n ? BANK_CATALOG.find((b) => b.name.toLowerCase() === n) : undefined;
}
