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

const EDF_THRESHOLDS = [10, 3] as const;
const REALISATION_THRESHOLDS = [60, 30] as const;
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
