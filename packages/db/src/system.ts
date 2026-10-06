/**
 * SYSTEM-LEVEL queries. These are NOT scoped to an actor and must only be called from trusted
 * backend jobs (runIngest, sweep, daily notifications, metrics), never with user-supplied ids
 * on behalf of a user.
 */
import type { Allocation, InvoiceFacts, YearMonth } from "@korra/core";
import { and, asc, eq, lt, sql } from "drizzle-orm";
import type { Db } from "./db";
import type { DocumentRecord } from "./repos";
import { allocationFromRow, invoiceFromRow } from "./mapping";
import * as s from "./schema";

export async function getDocumentForSystem(db: Db, id: string): Promise<DocumentRecord | null> {
  return (await db.select().from(s.document).where(eq(s.document.id, id)))[0] ?? null;
}

/** Documents `ingesting` since before `olderThan` that still have attempts left (re-queue these). */
export async function findStuckIngests(db: Db, olderThan: Date, maxAttempts: number): Promise<DocumentRecord[]> {
  return db
    .select()
    .from(s.document)
    .where(and(eq(s.document.status, "ingesting"), lt(s.document.statusChangedAt, olderThan), lt(s.document.attempts, maxAttempts)))
    .orderBy(asc(s.document.statusChangedAt), asc(s.document.id));
}

/** Marks `ingesting` documents that are stale and out of attempts as `failed`. Returns how many. */
export async function failExhaustedIngests(db: Db, olderThan: Date, maxAttempts: number, now = new Date()): Promise<number> {
  const rows = await db
    .update(s.document)
    .set({ status: "failed", error: `Ingest gave up after ${maxAttempts} attempts`, statusChangedAt: now })
    .where(and(eq(s.document.status, "ingesting"), lt(s.document.statusChangedAt, olderThan), sql`${s.document.attempts} >= ${maxAttempts}`))
    .returning({ id: s.document.id });
  return rows.length;
}

export interface NotificationUserState {
  userId: string;
  email: string;
  /** Months with at least one invoice. `submitted` = every AD bank used that month has a submitted pack. */
  months: { month: YearMonth; hasDeclaredInvoices: boolean; submitted: boolean }[];
  /** Raw material for core's `realisationOf`; the backend maps this into core's ScheduleState. */
  invoices: { facts: InvoiceFacts; allocations: Allocation[] }[];
}

export async function listNotificationState(db: Db): Promise<NotificationUserState[]> {
  const users = await db.select({ id: s.user.id, email: s.user.email }).from(s.user).orderBy(asc(s.user.id));
  const invRows = await db.select().from(s.invoice).orderBy(asc(s.invoice.createdAt), asc(s.invoice.id));
  const allocRows = await db.select().from(s.allocation).where(eq(s.allocation.status, "confirmed"));
  const packRows = await db.select().from(s.pack).where(eq(s.pack.status, "submitted"));

  return users.map((u) => {
    const mine = invRows.filter((r) => r.userId === u.id);
    const submitted = new Set(packRows.filter((p) => p.userId === u.id).map((p) => `${p.month}|${p.adBankId}`));
    const banksByMonth = new Map<string, Set<string>>();
    for (const r of mine) {
      if (!r.month) continue;
      (banksByMonth.get(r.month) ?? banksByMonth.set(r.month, new Set()).get(r.month)!).add(r.adBankId ?? "");
    }
    const months = [...banksByMonth.entries()]
      .sort(([x], [y]) => x.localeCompare(y))
      .map(([month, banks]) => ({
        month,
        hasDeclaredInvoices: true,
        submitted: [...banks].every((b) => submitted.has(`${month}|${b}`)),
      }));
    return {
      userId: u.id,
      email: u.email,
      months,
      invoices: mine.map((r) => ({
        facts: invoiceFromRow(r),
        allocations: allocRows.filter((a) => a.invoiceId === r.id).map(allocationFromRow),
      })),
    };
  });
}

/** Returns false when the dedupe key was already recorded (do not send again). */
export async function recordNotification(db: Db, userId: string, dedupeKey: string, now = new Date()): Promise<boolean> {
  const rows = await db
    .insert(s.notificationLog)
    .values({ id: crypto.randomUUID(), userId, dedupeKey, sentAt: now })
    .onConflictDoNothing({ target: s.notificationLog.dedupeKey })
    .returning({ id: s.notificationLog.id });
  return rows.length > 0;
}

/** CA lead-list metric: number of CAs with at least `n` distinct clients (accepted, not revoked). */
export async function countCasWithAtLeast(db: Db, n: number): Promise<number> {
  const rows = await db
    .select({ ca: s.caShare.caUserId })
    .from(s.caShare)
    .where(eq(s.caShare.status, "accepted"))
    .groupBy(s.caShare.caUserId)
    .having(sql`count(distinct ${s.caShare.ownerUserId}) >= ${n}`);
  return rows.length;
}
