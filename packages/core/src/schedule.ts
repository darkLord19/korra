import { addDays, diffDays, lastDayOfMonth } from "./dates";
import type { IsoDate, YearMonth } from "./types";

export function edfDueDate(month: YearMonth): IsoDate {
  // last day of month + 30 days
  return addDays(lastDayOfMonth(month), 30);
}

export interface NotificationIntent {
  userId: string;
  kind: "edf_due" | "realisation_due";
  dedupeKey: string; // e.g. "edf_due:2026-10:d10"; makes sending idempotent
  vars: Record<string, string>;
}

/**
 * Design choice (the design doc leaves ScheduleState open): one entry per user, carrying
 * only what the reminder rules need. `months` lists each month with declared invoices and
 * whether its pack is marked submitted; `invoices` lists invoices with their realisation
 * deadline and status so non-realised ones can be reminded 60 and 30 days out.
 */
export interface ScheduleUserState {
  userId: string;
  email: string;
  months: { month: YearMonth; hasDeclaredInvoices: boolean; submitted: boolean }[];
  invoices: {
    id: string;
    invoiceNo: string;
    deadline: IsoDate;
    status: "open" | "partially_realised" | "realised" | "overdue";
  }[];
}
export type ScheduleState = ScheduleUserState[];

/** Days before an EDF due date that a reminder fires. */
export const EDF_THRESHOLDS = [10, 3] as const;
/** Days before a realisation deadline that a reminder fires (also the alerts in the calendar export). */
export const REALISATION_THRESHOLDS = [60, 30] as const;
/** Catch-up window: a threshold also fires on the following 2 days, in case a cron run was missed. */
const CATCH_UP_DAYS = 2;

/** True when `today` is in [dueDate - threshold, dueDate - threshold + CATCH_UP_DAYS]. */
function inWindow(dueDate: IsoDate, today: IsoDate, threshold: number): boolean {
  const daysLeft = diffDays(today, dueDate);
  return daysLeft <= threshold && daysLeft >= threshold - CATCH_UP_DAYS;
}

/**
 * Reminders that should be sent on `today`. Each threshold fires on its exact day and,
 * to survive a missed cron run, on the next two days as well (the windows never overlap,
 * so at most one intent per threshold). The sender must treat `dedupeKey` as idempotent so
 * the catch-up days do not produce duplicate emails.
 */
export function dueNotifications(state: ScheduleState, today: IsoDate): NotificationIntent[] {
  const out: NotificationIntent[] = [];
  for (const user of state) {
    for (const m of user.months) {
      if (!m.hasDeclaredInvoices || m.submitted) continue;
      const dueDate = edfDueDate(m.month);
      for (const t of EDF_THRESHOLDS) {
        if (!inWindow(dueDate, today, t)) continue;
        out.push({
          userId: user.userId,
          kind: "edf_due",
          dedupeKey: `edf_due:${m.month}:d${t}`,
          vars: { month: m.month, dueDate },
        });
      }
    }
    for (const inv of user.invoices) {
      if (inv.status === "realised") continue;
      for (const t of REALISATION_THRESHOLDS) {
        if (!inWindow(inv.deadline, today, t)) continue;
        out.push({
          userId: user.userId,
          kind: "realisation_due",
          dedupeKey: `realisation_due:${inv.id}:d${t}`,
          vars: { invoiceNo: inv.invoiceNo, deadline: inv.deadline },
        });
      }
    }
  }
  return out;
}

/**
 * One all-day calendar entry. Dates stay ISO date strings end to end (no time zones involved): `endDate` is the
 * day after `date`, the exclusive end an all-day iCalendar event needs.
 */
export interface ScheduleEvent {
  /** Stable across exports (built from the invoice id or the month, never from editable text), so a calendar can update an entry instead of duplicating it. */
  uid: string;
  kind: "edf_due" | "realisation_deadline" | "realisation_alert";
  date: IsoDate;
  endDate: IsoDate;
  /** `edf_due` only. */
  month?: YearMonth;
  /** Realisation events only. */
  invoiceNo?: string;
  /** `realisation_alert` only: one of `REALISATION_THRESHOLDS`. */
  daysBefore?: number;
}

/** What the calendar needs: the months that have declared invoices, and each invoice's realisation deadline and status. No amounts, names or identifiers. */
export interface ScheduleSource {
  months: YearMonth[];
  invoices: ScheduleUserState["invoices"];
}

/**
 * The calendar export's entries, using the same due date (`edfDueDate`) and thresholds (`REALISATION_THRESHOLDS`)
 * as the reminder emails: the EDF due date of every month with invoices, and for every invoice not yet realised its
 * deadline plus the alerts before it. An alert that is already in the past (before `today`) is left out; the
 * deadline itself is kept even when overdue. Sorted by date, then uid, so the same data always gives the same list.
 */
export function scheduleEvents(source: ScheduleSource, today: IsoDate): ScheduleEvent[] {
  const events: ScheduleEvent[] = [];
  const add = (e: Omit<ScheduleEvent, "endDate">) => events.push({ ...e, endDate: addDays(e.date, 1) });

  for (const month of [...new Set(source.months)]) {
    add({ uid: `edf_due:${month}`, kind: "edf_due", date: edfDueDate(month), month });
  }
  for (const inv of source.invoices) {
    if (inv.status === "realised") continue;
    add({ uid: `realisation_deadline:${inv.id}`, kind: "realisation_deadline", date: inv.deadline, invoiceNo: inv.invoiceNo });
    for (const daysBefore of REALISATION_THRESHOLDS) {
      const date = addDays(inv.deadline, -daysBefore);
      if (date < today) continue;
      add({ uid: `realisation_due:${inv.id}:d${daysBefore}`, kind: "realisation_alert", date, invoiceNo: inv.invoiceNo, daysBefore });
    }
  }
  return events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.uid < b.uid ? -1 : a.uid > b.uid ? 1 : 0));
}
