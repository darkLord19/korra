import { realisationOf, type InvoiceFacts } from "@korra/core";
import type { Ctx } from "./deps";
import { repos, todayOf } from "./internal";
import { toWire } from "./wire";
import type { MoneyWire, TrackerWire } from "./wire-types";

const DUE_SOON_DAYS = 60;
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

function sumByCurrency(items: { currency: string; minor: bigint }[]): MoneyWire[] {
  const m = new Map<string, bigint>();
  for (const i of items) m.set(i.currency, (m.get(i.currency) ?? 0n) + i.minor);
  return [...m.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([currency, minor]) => ({ currency, minor: minor.toString() }));
}

/**
 * Every invoice with a date and amount, with its realisation. Totals per currency:
 * outstanding = all non-realised (overdue included); due60 = non-realised, not yet overdue, deadline
 * within 60 days; overdue = past deadline and not realised.
 */
export async function getTracker(ctx: Ctx): Promise<TrackerWire> {
  const r = repos(ctx);
  const [invoices, allocations] = await Promise.all([r.invoices.list(), r.allocations.list()]);
  const asOf = todayOf(ctx.deps);
  const rows = invoices
    .filter((i: InvoiceFacts) => i.invoiceDate.value !== null && i.amount.value !== null)
    .map((invoice) => ({ invoice, realisation: realisationOf(invoice, allocations, asOf) }))
    .sort((a, b) => (a.realisation.deadline < b.realisation.deadline ? -1 : a.realisation.deadline > b.realisation.deadline ? 1 : a.invoice.id < b.invoice.id ? -1 : 1));

  const open = rows.filter((x) => x.realisation.status !== "realised");
  return {
    asOf,
    totals: {
      outstanding: sumByCurrency(open.map((x) => x.realisation.outstanding)),
      due60: sumByCurrency(
        open
          .filter((x) => x.realisation.status !== "overdue" && daysBetween(asOf, x.realisation.deadline) <= DUE_SOON_DAYS)
          .map((x) => x.realisation.outstanding),
      ),
      overdue: sumByCurrency(open.filter((x) => x.realisation.status === "overdue").map((x) => x.realisation.outstanding)),
    },
    rows: rows.map((x) => ({ invoice: { ...toWire(x.invoice), documentId: null }, realisation: toWire(x.realisation) })),
  };
}
