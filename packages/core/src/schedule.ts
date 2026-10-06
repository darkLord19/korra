import type { IsoDate, YearMonth } from "./types";

export function edfDueDate(_month: YearMonth): IsoDate {
  // last day of month + 30 days
  throw new Error("not implemented");
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

export function dueNotifications(_state: ScheduleState, _today: IsoDate): NotificationIntent[] {
  throw new Error("not implemented");
}
