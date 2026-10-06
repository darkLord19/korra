import { minorExponent } from "@korra/core";

/** Minor units string -> "1500.50" for an input's default value. */
export function minorToMajor(minor: string, currency: string): string {
  const exp = minorExponent(currency);
  if (exp === 0) return minor;
  const p = minor.padStart(exp + 1, "0");
  return `${p.slice(0, -exp)}.${p.slice(-exp)}`;
}

/** "1,500.5" + USD -> "150050", or null when it is not a valid amount for that currency. */
export function majorToMinor(text: string, currency: string): string | null {
  const exp = minorExponent(currency);
  const m = /^(\d+)(?:\.(\d*))?$/.exec(text.trim().replace(/,/g, ""));
  if (!m) return null;
  const frac = m[2] ?? "";
  if (frac.length > exp) return null;
  return (m[1]! + frac.padEnd(exp, "0")).replace(/^0+(?=\d)/, "");
}
