// "Download calendar (.ics)" and "Export for my CA": both are built here, in the browser, from the local data.
// The reminder rules (EDF due date, realisation deadline, 60/30-day alerts) come from @korra/core, the file
// formats and the zip layout from @korra/packs; this file only gathers what they need and hands the result to the
// browser's download flow. Nothing is fetched: pack bytes are read straight from the blob store.
import { getTracker, type Ctx } from "@korra/backend";
import type { TrackerWire } from "@korra/backend/schemas";
import { scheduleEvents, type Allocation, type PaymentFacts, type ScheduleEvent, type ScheduleSource } from "@korra/core";
import { createRepos, type BlobStore } from "@korra/db";
import { buildCalendar, caExportFilename, renderCaExport, type CaExportInput, type CaExportPack, type TrackerCsvRow } from "@korra/packs";
import { DISCLAIMER } from "@korra/ui";
import { boot } from "./boot";
import { saveFile } from "./download";

export const CALENDAR_FILENAME = "korra-calendar.ics";
/** Used when an invoice has no number: the tracker says the same, and it keeps the calendar text free of ids. */
const NO_NUMBER = "(no number)";
const IST_OFFSET_MS = 330 * 60_000;

/** Today's date in India (YYYY-MM-DD), whatever time zone this machine is in. */
export const todayIST = (now: Date): string => new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/**
 * What the calendar needs from the tracker: the months that have declared invoices (the invoice date's month, which
 * is the EDF month) and each invoice's deadline and status as `realisationOf` computed them. Invoice numbers only,
 * so an amount, a client name or an identifier cannot reach the file.
 */
export function scheduleSourceOf(tracker: TrackerWire): ScheduleSource {
  const months = new Set<string>();
  const invoices: ScheduleSource["invoices"] = [];
  for (const { invoice, realisation } of tracker.rows) {
    const date = invoice.invoiceDate.value;
    if (date) months.add(date.slice(0, 7));
    invoices.push({ id: invoice.id, invoiceNo: invoice.invoiceNo.value ?? NO_NUMBER, deadline: realisation.deadline, status: realisation.status });
  }
  return { months: [...months].sort(), invoices };
}

export function calendarEventsOf(tracker: TrackerWire, now: Date): ScheduleEvent[] {
  return scheduleEvents(scheduleSourceOf(tracker), todayIST(now));
}

/** The tracker's rows (same filter, order and numbers as the screen) plus the confirmed payments behind each realised amount. */
export function trackerCsvRowsOf(tracker: TrackerWire, allocations: Allocation[], payments: PaymentFacts[]): TrackerCsvRow[] {
  const paymentById = new Map(payments.map((p) => [p.id, p]));
  return tracker.rows.map(({ invoice, realisation }) => ({
    invoiceNo: invoice.invoiceNo.value,
    clientName: invoice.clientName.value,
    invoiceDate: invoice.invoiceDate.value ?? "",
    amount: invoice.amount.value ?? { minor: "0", currency: "" },
    realised: realisation.realised,
    outstanding: realisation.outstanding,
    deadline: realisation.deadline,
    status: realisation.status,
    payments: allocations
      .filter((a) => a.invoiceId === invoice.id && a.status === "confirmed")
      .map((a) => {
        const p = paymentById.get(a.paymentId);
        return { date: p?.date.value ?? null, amount: { minor: a.amount.minor.toString(), currency: a.amount.currency }, reference: p?.firaRef.value ?? null };
      })
      .sort((x, y) => (x.date ?? "") < (y.date ?? "") ? -1 : (x.date ?? "") > (y.date ?? "") ? 1 : 0),
  }));
}

/** Everything the CA zip contains, read from the local data. Pure of side effects beyond reads. */
export async function collectCaExport(ctx: Ctx, blobs: Pick<BlobStore, "get">, now: Date): Promise<CaExportInput> {
  const r = createRepos(ctx.deps.db, ctx.actor, { now: ctx.deps.clock });
  const [tracker, packRecords, banks, payments, allocations] = await Promise.all([getTracker(ctx), r.packs.list(), r.banks.list(), r.payments.list(), r.allocations.list()]);
  const bankName = new Map(banks.map((b) => [b.id, b.name]));

  const packs: CaExportPack[] = [];
  for (const p of packRecords) {
    // The same files the pack screen offers, read from the store by key (a blob: URL cannot be fetched under connect-src 'self').
    const files = await Promise.all(p.files.map(async (f) => ({ name: f.name, bytes: await blobs.get(f.blobKey) })));
    packs.push({ month: p.month, bankName: bankName.get(p.adBankId) ?? "bank", status: p.status, generatedAt: p.generatedAt.toISOString(), submittedAt: p.submittedAt?.toISOString() ?? null, files });
  }
  return { now, packs, trackerRows: trackerCsvRowsOf(tracker, allocations, payments), events: calendarEventsOf(tracker, now), disclaimer: DISCLAIMER };
}

export interface CalendarExportResult {
  filename: string;
  events: number;
}

export interface CaExportResult {
  filename: string;
  packs: number;
  invoices: number;
}

/** Regenerates the calendar from the current data and downloads it. */
export async function runCalendarExport(now: () => Date = () => new Date()): Promise<CalendarExportResult> {
  const { ctx } = await boot();
  const at = now();
  const events = calendarEventsOf(await getTracker(ctx), at);
  saveFile(new Blob([buildCalendar({ events, now: at })], { type: "text/calendar;charset=utf-8" }), CALENDAR_FILENAME);
  return { filename: CALENDAR_FILENAME, events: events.length };
}

/** Builds the zip for the person's CA in memory and downloads it. */
export async function runCaExport(now: () => Date = () => new Date()): Promise<CaExportResult> {
  const { ctx, blobs } = await boot();
  const at = now();
  const input = await collectCaExport(ctx, blobs, at);
  const bytes = await renderCaExport(input);
  const filename = caExportFilename(at);
  saveFile(new Blob([bytes as BlobPart], { type: "application/zip" }), filename);
  return { filename, packs: input.packs.length, invoices: input.trackerRows.length };
}
