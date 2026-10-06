import type { Iso4217, Money } from "./types";

export function money(minor: bigint | number | string, currency: Iso4217): Money {
  if (typeof minor === "number" && !Number.isInteger(minor)) {
    throw new Error(`money(): minor units must be an integer, got ${minor}`);
  }
  return { minor: BigInt(minor), currency };
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new Error(`Currency mismatch: ${a.currency} vs ${b.currency}`);
  }
}

export function addMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor + b.minor, currency: a.currency };
}

export function subMoney(a: Money, b: Money): Money {
  assertSameCurrency(a, b);
  return { minor: a.minor - b.minor, currency: a.currency };
}

/** ISO 4217 minor-unit exponents that differ from 2. */
const EXPONENTS: Record<string, number> = { JPY: 0, KRW: 0, VND: 0, BHD: 3, KWD: 3, OMR: 3 };

export function minorExponent(currency: Iso4217): number {
  return EXPONENTS[currency] ?? 2;
}

/** "USD 1,234.50" (locale-independent; display formatting only). */
export function formatMoney(m: Money): string {
  const exp = minorExponent(m.currency);
  const neg = m.minor < 0n;
  const abs = neg ? -m.minor : m.minor;
  const base = 10n ** BigInt(exp);
  const whole = (abs / base).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const frac = exp > 0 ? "." + (abs % base).toString().padStart(exp, "0") : "";
  return `${m.currency} ${neg ? "-" : ""}${whole}${frac}`;
}

export interface MoneyJSON {
  minor: string;
  currency: Iso4217;
}

export function moneyToJSON(m: Money): MoneyJSON {
  return { minor: m.minor.toString(), currency: m.currency };
}

export function moneyFromJSON(j: MoneyJSON): Money {
  return { minor: BigInt(j.minor), currency: j.currency };
}
