import { edfDueDate } from "@korra/core";
import type { BlockerWire, OnboardingWire, MonthStateWire, PackWire, TrackerWire } from "@korra/backend/schemas";
import { dateLabel, daysBetween, monthLabel } from "../lib/format";

export type TaskKind = "setup" | "upload" | "review" | "generate" | "submit" | "realisation" | "backup";
export type Urgency = "urgent" | "soon" | "fyi";

export interface Task {
  id: string;
  kind: TaskKind;
  title: string;
  detail: string;
  due?: string;
  urgency: Urgency;
  icon: string;
  month?: string;
  packId?: string;
  invoiceId?: string;
  adBankId?: string;
  href?: string;
}

export interface DoneItem {
  id: string;
  title: string;
  icon: string;
}

export interface TaskInput {
  onboarding: OnboardingWire;
  months: { month: string; state: MonthStateWire }[];
  packs: PackWire[];
  tracker: TrackerWire | null;
  /** YYYY-MM-DD (IST) */
  today: string;
}

const KIND_ORDER: TaskKind[] = ["setup", "review", "generate", "upload", "submit", "realisation", "backup"];
const URGENCY_ORDER: Record<Urgency, number> = { urgent: 0, soon: 1, fyi: 2 };
const REALISATION_WINDOW_DAYS = 60;
const DONE_LIMIT = 5;

/** Overdue, or an EDF task due within 7 days, is urgent; due within 30 days is soon. */
function edfUrgency(due: string, today: string): Urgency {
  const days = daysBetween(today, due);
  if (days <= 7) return "urgent";
  return days <= 30 ? "soon" : "fyi";
}

function realisationUrgency(due: string, today: string): Urgency {
  const days = daysBetween(today, due);
  if (days < 0) return "urgent";
  return days <= 30 ? "soon" : "fyi";
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

const edfDetail = (due: string, today: string) => `EDF ${daysBetween(today, due) < 0 ? "was due" : "due"} ${dateLabel(due)}`;

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const byUrgency = URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency];
    if (byUrgency) return byUrgency;
    if (a.due !== b.due) {
      if (a.due === undefined) return 1;
      if (b.due === undefined) return -1;
      return a.due < b.due ? -1 : 1;
    }
    const byKind = KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind);
    if (byKind) return byKind;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** Blockers a person fixes by checking an invoice, de-duplicated (every bank repeats them). */
function reviewBlockers(state: MonthStateWire): BlockerWire[] {
  const seen = new Map<string, BlockerWire>();
  for (const bank of state.blockersByBank) {
    for (const b of bank.blockers) {
      if (b.kind === "flagged_field" || (b.kind === "missing_field" && b.entity === "invoice")) seen.set(`${b.kind}:${b.id}:${b.field}`, b);
    }
  }
  return [...seen.values()];
}

const hasExporterMissing = (state: MonthStateWire) =>
  state.blockersByBank.some((bank) => bank.blockers.some((b) => b.kind === "missing_field" && b.entity === "exporter"));

export function deriveTasks(input: TaskInput, extra: Task[] = []): { hero: Task | null; rest: Task[]; done: DoneItem[] } {
  const { onboarding, months, packs, tracker, today } = input;

  if (!onboarding.complete) {
    return {
      hero: { id: "setup", kind: "setup", title: "Set up and file your first EDF", detail: "Drop one invoice and we'll fill in the rest.", urgency: "urgent", icon: "✨" },
      rest: [],
      done: [],
    };
  }

  const tasks: Task[] = [...extra];
  const thisMonth = today.slice(0, 7);
  const dayOfMonth = Number(today.slice(8, 10));
  let needsProfile = false;

  for (const { month, state } of months) {
    const due = edfDueDate(month);
    const exporterMissing = hasExporterMissing(state);
    if (exporterMissing) needsProfile = true;

    const monthHasPack = packs.some((p) => p.month === month);
    if (state.invoices.length === 0 && !monthHasPack && !exporterMissing && !(month === thisMonth && dayOfMonth <= 5)) {
      tasks.push({
        id: `upload:${month}`, kind: "upload", title: `Add your ${monthLabel(month)} invoices`, detail: edfDetail(due, today),
        due, urgency: edfUrgency(due, today), icon: "📤", month,
      });
    }

    const checks = reviewBlockers(state);
    if (checks.length > 0) {
      tasks.push({
        id: `review:${month}`, kind: "review", title: `${plural(checks.length, "quick check", "quick checks")} on ${monthLabel(month).split(" ")[0]}`,
        detail: edfDetail(due, today), due, urgency: edfUrgency(due, today), icon: "✏️", month,
      });
    }

    if (state.invoices.length > 0) {
      for (const bank of state.blockersByBank) {
        if (bank.blockers.length > 0 || packs.some((p) => p.month === month && p.adBankId === bank.adBankId)) continue;
        tasks.push({
          id: `generate:${month}:${bank.adBankId}`, kind: "generate", title: `Your ${monthLabel(month).split(" ")[0]} pack is ready to make`,
          detail: edfDetail(due, today), due, urgency: edfUrgency(due, today), icon: "📦", month, adBankId: bank.adBankId,
        });
      }
    }
  }

  if (needsProfile) {
    tasks.push({
      id: "profile", kind: "review", title: "Finish your details", detail: "A few business details are missing from your profile.",
      urgency: "urgent", icon: "🪪", href: "settings",
    });
  }

  for (const pack of packs) {
    if (pack.status !== "generated") continue;
    const due = edfDueDate(pack.month);
    const bankName = onboarding.banks.find((b) => b.id === pack.adBankId)?.name ?? "your bank";
    tasks.push({
      id: `submit:${pack.id}`, kind: "submit", title: `Send your ${monthLabel(pack.month)} pack to ${bankName}`, detail: edfDetail(due, today),
      due, urgency: edfUrgency(due, today), icon: "📮", month: pack.month, packId: pack.id, adBankId: pack.adBankId,
    });
  }

  for (const row of tracker?.rows ?? []) {
    const { status, deadline } = row.realisation;
    if (status === "realised") continue;
    const days = daysBetween(today, deadline);
    if (days > REALISATION_WINDOW_DAYS) continue;
    const overdue = days < 0;
    const invoiceNo = row.invoice.invoiceNo.value ?? "Invoice";
    tasks.push({
      id: `realisation:${row.invoice.id}`, kind: "realisation",
      title: overdue ? `${invoiceNo}: payment overdue` : `${invoiceNo}: payment due ${days === 0 ? "today" : `in ${plural(days, "day", "days")}`}`,
      detail: `${overdue ? "Was due" : "Due"} ${dateLabel(deadline)}`,
      due: deadline, urgency: realisationUrgency(deadline, today), icon: "⏳", invoiceId: row.invoice.id,
    });
  }

  const sorted = sortTasks(tasks);

  const sent: DoneItem[] = packs
    .filter((p) => p.status === "submitted")
    .sort((a, b) => (b.submittedAt ?? "").localeCompare(a.submittedAt ?? ""))
    .map((p) => ({ id: `submitted:${p.id}`, title: `Sent ${monthLabel(p.month)} pack`, icon: "✅" }));
  const paid: DoneItem[] = (tracker?.rows ?? [])
    .filter((r) => r.realisation.status === "realised")
    .map((r) => ({ id: `realised:${r.invoice.id}`, title: `${r.invoice.invoiceNo.value ?? "Invoice"} paid`, icon: "💸" }));

  return { hero: sorted[0] ?? null, rest: sorted.slice(1), done: [...sent, ...paid].slice(0, DONE_LIMIT) };
}

export function findTask(tasks: { hero: Task | null; rest: Task[] }, id: string): Task | null {
  return [tasks.hero, ...tasks.rest].find((t) => t?.id === id) ?? null;
}
