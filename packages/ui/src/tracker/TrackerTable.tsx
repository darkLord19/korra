"use client";
import { useMemo, useState } from "react";
import type { TrackerRowWire } from "@korra/backend/schemas";
import { Badge, Select, Table, Td, Th } from "../components";
import { dateLabel, daysBetween, money } from "../lib/format";

type Status = TrackerRowWire["realisation"]["status"];
const LABEL: Record<Status, string> = { open: "Open", partially_realised: "Partially realised", realised: "Realised", overdue: "Overdue" };
const TONE: Record<Status, "neutral" | "accent" | "ok" | "danger"> = { open: "neutral", partially_realised: "accent", realised: "ok", overdue: "danger" };

function daysLeft(status: Status, asOf: string, deadline: string): string {
  if (status === "realised") return "Done";
  const d = daysBetween(asOf, deadline);
  if (d < 0) return `${-d} ${-d === 1 ? "day" : "days"} overdue`;
  return d === 0 ? "Due today" : `${d} ${d === 1 ? "day" : "days"}`;
}

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
      <div className="flex flex-wrap items-end justify-between gap-3 px-5">
        <div>
          <label htmlFor="tracker-status" className="block text-xs font-medium text-muted">Show</label>
          <Select id="tracker-status" value={status} onChange={(e) => setStatus(e.target.value as "all" | Status)} className="mt-1 w-52">
            <option value="all">All invoices</option>
            {(Object.keys(LABEL) as Status[]).map((s) => <option key={s} value={s}>{LABEL[s]}</option>)}
          </Select>
        </div>
        <p className="text-xs text-muted" aria-live="polite">{shown.length} of {rows.length} invoices</p>
      </div>
      {shown.length === 0 ? (
        <p className="px-5 py-4 text-sm text-muted">No invoices with this status.</p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Invoice</Th><Th>Client</Th><Th>Invoice date</Th>
              <Th className="text-right">Amount</Th><Th className="text-right">Realised</Th><Th className="text-right">Outstanding</Th>
              <Th aria-sort={dir === "asc" ? "ascending" : "descending"}>
                <button type="button" onClick={() => setDir(dir === "asc" ? "desc" : "asc")} className="font-medium hover:text-ink" aria-label={`Deadline, sorted ${dir === "asc" ? "earliest first" : "latest first"}. Change order`}>
                  Deadline {dir === "asc" ? "↑" : "↓"}
                </button>
              </Th>
              <Th>Status</Th><Th>Days left</Th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ invoice: i, realisation: r }) => (
              <tr key={i.id}>
                <Td className="font-medium">{i.invoiceNo.value ?? "(no number)"}</Td>
                <Td>{i.clientName.value ?? <span className="text-muted">Unknown</span>}</Td>
                <Td className="whitespace-nowrap">{i.invoiceDate.value ? dateLabel(i.invoiceDate.value) : ""}</Td>
                <Td className="text-right whitespace-nowrap">{money(i.amount.value)}</Td>
                <Td className="text-right whitespace-nowrap">{money(r.realised)}</Td>
                <Td className="text-right whitespace-nowrap">{money(r.outstanding)}</Td>
                <Td className="whitespace-nowrap">{dateLabel(r.deadline)}</Td>
                <Td><Badge tone={TONE[r.status]}>{LABEL[r.status]}</Badge></Td>
                <Td className="whitespace-nowrap">{daysLeft(r.status, asOf, r.deadline)}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
