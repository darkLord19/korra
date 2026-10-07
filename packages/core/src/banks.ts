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

/** IFSC prefixes (first 4 characters) of the catalog banks. Only prefixes that are certain; other banks are left to the user. */
const IFSC_PREFIX_TO_KEY: Record<string, string> = {
  HDFC: "hdfc", ICIC: "icici", UTIB: "axis", SBIN: "sbi", KKBK: "kotak",
  YESB: "yes", IDFB: "idfc-first", INDB: "indusind", BARB: "bob", PUNB: "pnb",
};

/** The catalog bank an IFSC belongs to, by its 4-letter bank prefix. */
export function findCatalogBankByIfsc(ifsc: string): BankCatalogEntry | undefined {
  const key = IFSC_PREFIX_TO_KEY[ifsc.trim().toUpperCase().slice(0, 4)];
  return key ? BANK_CATALOG.find((b) => b.key === key) : undefined;
}

const words = (s: string) => ` ${s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;

/** The catalog bank a printed bank name points to: an exact name, or a name that contains one ("HDFC Bank Ltd."). */
export function findCatalogBankInName(name: string): BankCatalogEntry | undefined {
  const exact = findCatalogBank(name);
  if (exact) return exact;
  const n = words(name);
  return BANK_CATALOG.find((b) => n.includes(words(b.name)));
}
