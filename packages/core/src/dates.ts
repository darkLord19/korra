import type { IsoDate, YearMonth } from "./types";

/** Private UTC-only ISO date arithmetic. Not exported from the package entry. */

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(d: IsoDate): [number, number, number] {
  const m = ISO_DATE.exec(d);
  if (!m) throw new Error(`Invalid ISO date: ${d}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const day = Number(m[3]);
  if (mo < 1 || mo > 12 || day < 1 || day > daysInMonth(y, mo)) throw new Error(`Invalid ISO date: ${d}`);
  return [y, mo, day];
}

function pad(n: number, w = 2): string {
  return String(n).padStart(w, "0");
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function format(y: number, m: number, d: number): IsoDate {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

function toEpochDay(d: IsoDate): number {
  const [y, m, day] = parts(d);
  return Math.round(Date.UTC(y, m - 1, day) / MS_PER_DAY);
}

export function addDays(d: IsoDate, days: number): IsoDate {
  const dt = new Date((toEpochDay(d) + days) * MS_PER_DAY);
  return format(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Whole days from a to b (b - a). */
export function diffDays(a: IsoDate, b: IsoDate): number {
  return toEpochDay(b) - toEpochDay(a);
}

/** Adds calendar months, clamping to the end of the target month (31 Jan + 9m = 31 Oct; 31 May + 9m = 29 Feb in a leap year). */
export function addMonths(d: IsoDate, months: number): IsoDate {
  const [y, m, day] = parts(d);
  const idx = y * 12 + (m - 1) + months;
  const ny = Math.floor(idx / 12);
  const nm = (idx % 12) + 1;
  return format(ny, nm, Math.min(day, daysInMonth(ny, nm)));
}

export function lastDayOfMonth(month: YearMonth): IsoDate {
  const m = /^(\d{4})-(\d{2})$/.exec(month);
  if (!m) throw new Error(`Invalid year-month: ${month}`);
  const y = Number(m[1]);
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) throw new Error(`Invalid year-month: ${month}`);
  return format(y, mo, daysInMonth(y, mo));
}

/** "2026-10-05" -> "2026-10". */
export function yearMonthOf(d: IsoDate): YearMonth {
  const [y, m] = parts(d);
  return `${pad(y, 4)}-${pad(m)}`;
}
