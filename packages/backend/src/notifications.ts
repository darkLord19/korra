import { dueNotifications, realisationOf, type NotificationIntent, type ScheduleState } from "@korra/core";
import { listNotificationState, recordNotification } from "@korra/db";
import type { Deps } from "./deps-types";
import { todayOf } from "./internal";
import type { NotificationRunResult } from "./wire-types";

const DISCLAIMER =
  "Korra is a record-keeping aid, not legal, tax or financial advice. Please confirm requirements with your AD bank or chartered accountant.";

export function composeNotification(intent: NotificationIntent, appUrl: string): { subject: string; text: string } {
  const v = intent.vars;
  if (intent.kind === "edf_due") {
    return {
      subject: `Your EDF for ${v.month} is due on ${v.dueDate}`,
      text: [
        `Your Export Declaration Form for invoices dated ${v.month} is due on ${v.dueDate}.`,
        `Open the month to check your invoices and download the pack:`,
        `${appUrl}/months/${v.month}`,
        "",
        DISCLAIMER,
      ].join("\n"),
    };
  }
  return {
    subject: `Invoice ${v.invoiceNo}: export payment due by ${v.deadline}`,
    text: [
      `Invoice ${v.invoiceNo} has not been fully realised yet. The realisation deadline is ${v.deadline}.`,
      `Check the tracker:`,
      `${appUrl}/tracker`,
      "",
      DISCLAIMER,
    ].join("\n"),
  };
}

/** Daily cron (system call). Records each dedupe key before sending, so a key is never sent twice. */
export async function runDailyNotifications(deps: Deps): Promise<NotificationRunResult> {
  const today = todayOf(deps);
  const users = await listNotificationState(deps.db);
  const state: ScheduleState = users.map((u) => ({
    userId: u.userId,
    email: u.email,
    months: u.months,
    invoices: u.invoices
      .filter((i) => i.facts.invoiceDate.value !== null && i.facts.amount.value !== null)
      .map(({ facts, allocations }) => {
        const real = realisationOf(facts, allocations, today);
        return { id: facts.id, invoiceNo: facts.invoiceNo.value ?? facts.id, deadline: real.deadline, status: real.status };
      }),
  }));
  const emailOf = new Map(users.map((u) => [u.userId, u.email]));

  const result: NotificationRunResult = { sent: 0, skipped: 0, failed: 0 };
  for (const intent of dueNotifications(state, today)) {
    const to = emailOf.get(intent.userId);
    if (!to || !(await recordNotification(deps.db, intent.userId, intent.dedupeKey, deps.clock()))) {
      result.skipped++;
      continue;
    }
    try {
      await deps.mailer.send({ to, ...composeNotification(intent, deps.appUrl) });
      result.sent++;
    } catch (e) {
      console.error(`[korra] notification ${intent.dedupeKey} failed to send`, e);
      result.failed++;
    }
  }
  return result;
}
