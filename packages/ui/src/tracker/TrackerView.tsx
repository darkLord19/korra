"use client";
import type { MoneyWire, TrackerWire } from "@korra/backend/schemas";
import { Card, CardBody, CardHeader, buttonClass, cx } from "../components";
import { useNav } from "../context";
import { money } from "../lib/format";
import { TrackerTable } from "./TrackerTable";

function Tile({ label, hint, amounts, tone }: { label: string; hint: string; amounts: MoneyWire[]; tone?: "flag" | "danger" }) {
  return (
    <div className={cx("rounded-lg border p-4", tone === "danger" && amounts.length ? "border-danger/40 bg-danger-soft" : tone === "flag" && amounts.length ? "border-flag/40 bg-flag-soft" : "border-line bg-surface")}>
      <p className="text-sm font-medium">{label}</p>
      {amounts.length === 0 ? (
        <p className="mt-2 text-lg text-muted">Nothing</p>
      ) : (
        <ul className="mt-2 space-y-0.5">
          {amounts.map((m) => <li key={m.currency} className="font-serif text-2xl font-semibold">{money(m)}</li>)}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">{hint}</p>
    </div>
  );
}

/** Realisation tracker: totals per currency and every declared invoice with its deadline. Display only, so it serves owner and CA alike. */
export function TrackerView({ tracker, readOnly = false }: { tracker: TrackerWire; readOnly?: boolean }) {
  const nav = useNav();
  const { Link } = nav;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Realisation tracker</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">Exports must be realised within 9 months of the invoice date (12 for INR invoices).</p>
      </div>

      {tracker.rows.length === 0 ? (
        <Card aria-labelledby="empty-h">
          <CardHeader id="empty-h" title="No invoices to track yet" />
          <CardBody className="space-y-3 text-sm">
            <p className="max-w-prose">Every invoice that has a date and an amount appears here with the deadline for receiving the money, how much has been matched to payments so far, and how many days are left. Upload invoices and confirm their matches on a month page to start.</p>
            {!readOnly && <Link href={nav.hrefs.home()} className={buttonClass("secondary")}>Go to this month</Link>}
          </CardBody>
        </Card>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3" role="group" aria-label="Totals by currency">
            <Tile label="Outstanding" hint="Not yet received, all invoices" amounts={tracker.totals.outstanding} />
            <Tile label="Due within 60 days" hint="Deadline in the next 60 days" amounts={tracker.totals.due60} tone="flag" />
            <Tile label="Overdue" hint="Past the deadline and not received" amounts={tracker.totals.overdue} tone="danger" />
          </div>
          <Card aria-labelledby="invoices-h">
            <CardHeader id="invoices-h" title="Declared invoices" description="Only payments you have confirmed on a month page count as received." />
            <CardBody className="px-0 py-4"><TrackerTable rows={tracker.rows} asOf={tracker.asOf} /></CardBody>
          </Card>
        </>
      )}
    </div>
  );
}
