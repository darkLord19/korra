"use client";
import { useMemo, useState } from "react";
import type { TrackerRowWire } from "@korra/backend/schemas";
import { Badge, Select } from "../components";
import { dateLabel, daysBetween, money } from "../lib/format";

type Status = TrackerRowWire["realisation"]["status"];
const LABEL: Record<Status, string> = { open: "Open", partially_realised: "Part paid", realised: "Realised", overdue: "Overdue" };
const TONE: Record<Status, "neutral" | "accent" | "ok" | "danger"> = { open: "neutral", partially_realised: "accent", realised: "ok", overdue: "danger" };

function daysLeft(status: Status, asOf: string, deadline: string): string {
  if (status === "realised") return "Done";
  const d = daysBetween(asOf, deadline);
  if (d < 0) return `${-d} ${-d === 1 ? "day" : "days"} overdue`;
  return d === 0 ? "Due today" : `${d} ${d === 1 ? "day" : "days"} left`;
}

/** Every declared invoice as a card (deadline first), with a status filter and a sort order. Works at phone width. */
export function TrackerTable({ rows, asOf }: { rows: TrackerRowWire[]; asOf: string }) {
  const [status, setStatus] = useState<"all" | Status>("all");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const shown = useMemo(() => {
    const filtered = rows.filter((r) => status === "all" || r.realisation.status === status);
    const sign = dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => sign * (a.realisation.deadline < b.realisation.deadline ? -1 : a.realisation.deadline > b.realisation.deadline ? 1 : 0));
  }, [rows, status, dir]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <label htmlFor="tracker-status" className="block text-xs font-bold text-muted">Show</label>
          <Select id="tracker-status" value={status} onChange={(e) => setStatus(e.target.value as "all" | Status)} className="mt-1 w-52">
            <option value="all">All invoices</option>
            {(Object.keys(LABEL) as Status[]).map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
          </Select>
        </div>
        <button type="button" onClick={() => setDir(dir === "asc" ? "desc" : "asc")} className="min-h-11 rounded-full px-3 text-sm font-bold text-accent hover:bg-accent-soft" aria-label={`Deadline, sorted ${dir === "asc" ? "earliest first" : "latest first"}. Change order`}>
          Deadline {dir === "asc" ? "↑" : "↓"}
        </button>
      </div>
      <p className="text-xs text-muted" aria-live="polite">{shown.length} of {rows.length} invoices</p>
      {shown.length === 0 ? (
        <p className="rounded-2xl bg-surface-soft p-5 text-sm text-muted">No invoices with this status.</p>
      ) : (
        <ul className="space-y-2">
          {shown.map(({ invoice: i, realisation: r }) => (
            <li key={i.id} className="rounded-2xl border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold">{i.invoiceNo.value ?? "(no number)"}<span className="font-normal text-muted"> · {i.clientName.value ?? "Unknown client"}</span></p>
                  <p className="text-sm text-muted">Due by {dateLabel(r.deadline)} · {daysLeft(r.status, asOf, r.deadline)}</p>
                </div>
                <Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
                <div><dt className="text-xs text-muted">Invoice</dt><dd className="font-bold">{money(i.amount.value)}</dd></div>
                <div><dt className="text-xs text-muted">Received</dt><dd className="font-bold">{money(r.realised)}</dd></div>
                <div><dt className="text-xs text-muted">Outstanding</dt><dd className="font-bold">{money(r.outstanding)}</dd></div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
