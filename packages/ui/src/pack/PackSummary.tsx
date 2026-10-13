import type { MoneyWire } from "@korra/backend/schemas";
import { FileName } from "../components";
import { money, monthLabel } from "../lib/format";
import { fileDescription } from "./files";

/** The pack at a glance: month and bank, how many invoices, and the totals per currency. */
export function PackSummaryCard({ month, bankName, invoiceCount, totals }: { month: string; bankName: string; invoiceCount: number; totals: MoneyWire[] }) {
  return (
    <div className="space-y-1 rounded-2xl border border-line bg-surface-soft p-5">
      <p className="text-sm text-muted">{monthLabel(month)} · {bankName}</p>
      <p className="text-xl font-bold">{invoiceCount} {invoiceCount === 1 ? "invoice" : "invoices"}</p>
      <p className="text-sm">{totals.length > 0 ? totals.map((t) => money(t)).join(" · ") : "No amounts yet"}</p>
    </div>
  );
}

/** Each file in the pack with a line on what it is and a download link. */
export function PackFiles({ files }: { files: { name: string; url: string }[] }) {
  return (
    <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
      {files.map((f) => (
        <li key={f.name} className="flex flex-col gap-2 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <FileName name={f.name} />
            <p className="mt-0.5 text-xs text-muted">{fileDescription(f.name)}</p>
          </div>
          <a href={f.url} download={f.name} aria-label={`Download ${f.name}`} className="shrink-0 self-start text-sm font-bold text-accent underline sm:self-center">
            Download
          </a>
        </li>
      ))}
    </ul>
  );
}
