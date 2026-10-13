"use client";
import type { InvoiceWire, RealisationWire } from "@korra/backend/schemas";
import { Badge } from "../components";
import { flaggedCount } from "../lib/fields";
import { dateLabel, money } from "../lib/format";

export const realisationLabel = (r: RealisationWire) => {
  switch (r.status) {
    case "open": return `Payment due by ${dateLabel(r.deadline)}`;
    case "partially_realised": return `Part paid · due by ${dateLabel(r.deadline)}`;
    case "overdue": return `Overdue since ${dateLabel(r.deadline)}`;
    case "realised": return "Realised";
  }
};

export const realisationTone = (r: RealisationWire) => (r.status === "realised" ? "ok" : r.status === "overdue" ? "danger" : "neutral");

/** One invoice in the month list: who, which invoice, how much, and what needs a look. Opens the invoice sheet. */
export function InvoiceCard({ invoice, realisation, onOpen }: { invoice: InvoiceWire; realisation?: RealisationWire | undefined; onOpen: () => void }) {
  const flagged = flaggedCount(invoice);
  const date = invoice.invoiceDate.value;
  return (
    <button type="button" onClick={onOpen} className="flex w-full flex-col gap-2 rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:bg-accent-soft">
      <span className="flex items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate font-bold">{invoice.clientName.value ?? "Unknown client"}</span>
          <span className="block text-sm text-muted">{invoice.invoiceNo.value ?? "(no number)"}{date ? ` · ${dateLabel(date)}` : ""}</span>
        </span>
        <span className="whitespace-nowrap font-extrabold">{money(invoice.amount.value)}</span>
      </span>
      {(flagged > 0 || realisation) && (
        <span className="flex flex-wrap gap-2">
          {flagged > 0 && <Badge tone="flag">{flagged} to check</Badge>}
          {realisation && <Badge tone={realisationTone(realisation)}>{realisationLabel(realisation)}</Badge>}
        </span>
      )}
    </button>
  );
}
