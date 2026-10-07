/** GSTIN: 2-digit state code, the holder's 10-character PAN, entity number, "Z", check character. */
export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/;
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

/** The PAN inside a GSTIN (characters 3 to 12), or null unless `gstin` is a full, well-formed GSTIN. Case and outer spaces are ignored. */
export function panFromGstin(gstin: string): string | null {
  const g = gstin.trim().toUpperCase();
  return GSTIN_RE.test(g) ? g.slice(2, 12) : null;
}

/** IFSC: 4 letters (the bank), a zero, 6 characters (the branch). */
export const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
