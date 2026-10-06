import { minorExponent, money, type Field, type IsoDate, type Money } from "@korra/core";

/** Parsed value plus how sure we are: 1 = exact, 0.7 = needed a heuristic. */
export interface Parsed<T> {
  value: T;
  confidence: number;
}

export const HEURISTIC = 0.7;

export function field<T>(value: T | null, confidence: number): Field<T> {
  return value === null
    ? { value: null, confidence: 0, source: "extracted" }
    : { value, confidence, source: "extracted" };
}

export const missing = <T>(): Field<T> => field<T>(null, 0);

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

const SYMBOLS = /[$€£¥₹]|\b[A-Za-z]{3}\b/g;

/**
 * Parse a human-formatted amount into integer minor units (no floats).
 *
 * - "1,234.56", "$1,234.56", "USD 1,234.56", "(1,234.56)", "-10" -> exact (1)
 * - "1.234,56" (European) -> 0.7
 * - lone comma ("12,50", "1,234") or lone dot with 3 digits ("1.234" for 2-decimal currencies)
 *   is ambiguous -> best guess, 0.7
 * Returns null when it cannot be read as a number.
 */
export function parseAmount(raw: string, currency: string): Parsed<Money> | null {
  let s = raw.trim();
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) {
    neg = true;
    s = s.slice(1, -1);
  }
  s = s.replace(SYMBOLS, "").replace(/[\s\u00a0']/g, "");
  if (s.startsWith("-")) {
    neg = true; // explicit minus always means negative
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const exp = minorExponent(currency);
  let confidence = 1;
  let intPart: string;
  let fracPart = "";

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  const dots = (s.match(/\./g) ?? []).length;
  const commas = (s.match(/,/g) ?? []).length;

  const asDecimal = (sep: "." | ",") => {
    const idx = sep === "." ? lastDot : lastComma;
    const other = sep === "." ? "," : ".";
    intPart = s.slice(0, idx).split(other).join("");
    fracPart = s.slice(idx + 1);
  };
  const asThousands = () => {
    intPart = s.replace(/[.,]/g, "");
  };

  if (lastDot >= 0 && lastComma >= 0) {
    if (lastDot > lastComma) {
      if (dots > 1) return null;
      asDecimal(".");
    } else {
      if (commas > 1) return null;
      asDecimal(",");
      confidence = HEURISTIC;
    }
  } else if (lastComma >= 0) {
    const after = s.length - lastComma - 1;
    if (commas > 1) {
      asThousands(); // 1,234,567
    } else if (after === 3 && exp !== 3) {
      asThousands(); // 1,234 : thousands, but could be a decimal comma
      if (exp !== 0) confidence = HEURISTIC; // zero-decimal currencies cannot have a decimal comma
    } else {
      asDecimal(",");
      confidence = HEURISTIC;
    }
  } else if (lastDot >= 0) {
    const after = s.length - lastDot - 1;
    if (dots > 1) {
      asThousands(); // 1.234.567 (European thousands)
      confidence = HEURISTIC;
    } else if (after === 3 && exp !== 3) {
      asThousands(); // 1.234 : ambiguous
      confidence = HEURISTIC;
    } else {
      asDecimal(".");
    }
  } else {
    intPart = s;
  }

  intPart = intPart!;
  if (!/^\d*$/.test(intPart) || !/^\d*$/.test(fracPart)) return null;
  if (fracPart.length > exp) {
    // Extra precision: only accept if the surplus digits are all zero.
    if (/[1-9]/.test(fracPart.slice(exp))) return null;
    fracPart = fracPart.slice(0, exp);
  }
  const digits = (intPart || "0") + fracPart.padEnd(exp, "0");
  const minor = BigInt(digits);
  return { value: money(neg ? -minor : minor, currency), confidence };
}

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function iso(y: number, m: number, d: number): IsoDate | null {
  if (m < 1 || m > 12 || d < 1) return null;
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > dim || y < 1900 || y > 2200) return null;
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Parse a date into ISO. Documented choice for ambiguity: "03/10/2026" (both parts <= 12 and
 * different) is read as DD/MM/YYYY, because the users are Indian exporters, and returned with
 * confidence 0.7 so the review UI flags it. Unambiguous slash dates (a part > 12) are exact.
 */
export function parseDate(raw: string): Parsed<IsoDate> | null {
  const s = raw.trim();
  if (!s) return null;
  let m: RegExpMatchArray | null;

  // ISO, optionally with a time part
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[T\s].*)?$/))) {
    const v = iso(+m[1]!, +m[2]!, +m[3]!);
    return v ? { value: v, confidence: 1 } : null;
  }
  // NN/NN/YYYY (also - and .)
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/))) {
    const a = +m[1]!;
    const b = +m[2]!;
    const y = +m[3]!;
    if (a > 12) {
      const v = iso(y, b, a);
      return v ? { value: v, confidence: 1 } : null;
    }
    if (b > 12) {
      const v = iso(y, a, b);
      return v ? { value: v, confidence: 1 } : null;
    }
    const v = iso(y, b, a); // DD/MM preferred
    return v ? { value: v, confidence: a === b ? 1 : HEURISTIC } : null;
  }
  // "Oct 3, 2026" / "October 3 2026"
  if ((m = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/))) {
    const mo = MONTHS[m[1]!.slice(0, 3).toLowerCase()];
    const v = mo ? iso(+m[3]!, mo, +m[2]!) : null;
    return v ? { value: v, confidence: 1 } : null;
  }
  // "3 Oct 2026" / "03-Oct-2026"
  if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([A-Za-z]{3,9})\.?,?[\s-]+(\d{4})$/))) {
    const mo = MONTHS[m[2]!.slice(0, 3).toLowerCase()];
    const v = mo ? iso(+m[3]!, mo, +m[1]!) : null;
    return v ? { value: v, confidence: 1 } : null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Misc
// ---------------------------------------------------------------------------

/** Lower-case, strip everything but letters/digits: "Received_Amount " -> "receivedamount". */
export const normHeader = (h: string): string => h.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Decimal string for an FX rate ("83.50", "1,05" ambiguity not guessed: commas stripped as thousands). */
export function parseRate(raw: string): string | null {
  const s = raw.trim().replace(/,/g, "");
  return /^\d+(\.\d+)?$/.test(s) ? s : null;
}

export function parseCurrency(raw: string | undefined): string | null {
  const s = (raw ?? "").trim().toUpperCase();
  return /^[A-Z]{3}$/.test(s) ? s : null;
}
