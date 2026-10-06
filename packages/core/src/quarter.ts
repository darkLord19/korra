import { lastDayOfMonth, yearMonthOf } from "./dates";
import type { IsoDate } from "./types";

/** Calendar quarter, e.g. "2026-Q4" (Oct-Dec 2026). */
export type Quarter = `${number}-Q${1 | 2 | 3 | 4}`;

const QUARTER = /^(\d{4})-Q([1-4])$/;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseQuarter(q: string): [number, number] {
  const m = QUARTER.exec(q);
  if (!m) throw new Error(`Invalid quarter: ${q}`);
  return [Number(m[1]), Number(m[2])];
}

const pad2 = (n: number) => String(n).padStart(2, "0");

export function quarterOf(date: IsoDate): Quarter {
  const ym = yearMonthOf(date); // validates the date
  const year = Number(ym.slice(0, 4));
  const month = Number(ym.slice(5, 7));
  return `${year}-Q${Math.ceil(month / 3) as 1 | 2 | 3 | 4}`;
}

/** First and last day (inclusive) of a calendar quarter. */
export function quarterRange(q: Quarter): { start: IsoDate; end: IsoDate } {
  const [y, n] = parseQuarter(q);
  const firstMonth = 3 * n - 2;
  return { start: `${y}-${pad2(firstMonth)}-01`, end: lastDayOfMonth(`${y}-${pad2(firstMonth + 2)}`) };
}

/**
 * Calendar months plus the Indian financial-year quarter (FY runs Apr-Mar, so Apr-Jun is Q1):
 * "Oct-Dec 2026 (Q3 FY 2026-27)"; Jan-Mar 2027 is "(Q4 FY 2026-27)".
 */
export function quarterLabel(q: Quarter): string {
  const [y, n] = parseQuarter(q);
  const first = MONTH_NAMES[3 * n - 3];
  const last = MONTH_NAMES[3 * n - 1];
  const fyStart = n === 1 ? y - 1 : y;
  const fyQuarter = n === 1 ? 4 : n - 1;
  return `${first}–${last} ${y} (Q${fyQuarter} FY ${fyStart}-${pad2((fyStart + 1) % 100)})`;
}
