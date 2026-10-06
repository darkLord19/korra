import { minorExponent, type Money, type YearMonth } from "@korra/core";

export function bankSlug(name: string): string {
  const s = name
    .normalize("NFKD")
    .replace(/[\u0080-￿]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "bank";
}

/** Major-unit number for spreadsheets (export only; arithmetic stays in bigint minor). */
export function toMajor(m: Money): number {
  return Number(m.minor) / 10 ** minorExponent(m.currency);
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export function monthLabel(month: YearMonth): string {
  const [y, m] = month.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** Drops control characters (code < 32 and DEL), optionally keeping tab, LF and CR. */
export function stripControls(s: string, keepWhitespace = false): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    const control = c < 32 || c === 127;
    if (!control || (keepWhitespace && (c === 9 || c === 10 || c === 13))) out += ch;
  }
  return out;
}
