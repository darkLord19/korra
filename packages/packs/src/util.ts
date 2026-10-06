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
