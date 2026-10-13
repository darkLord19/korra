"use client";
import type { MoneyWire, TrackerWire } from "@korra/backend/schemas";
import { buttonClass, cx, EmptyState } from "../components";
import { useNav } from "../context";
import { money } from "../lib/format";
import { TrackerTable } from "./TrackerTable";

function Tile({ label, amounts, tone }: { label: string; amounts: MoneyWire[]; tone?: "flag" | "danger" }) {
  return (
    <div className={cx("rounded-2xl p-4", tone === "danger" && amounts.length ? "bg-danger-soft" : tone === "flag" && amounts.length ? "bg-flag-soft" : "bg-surface-soft")}>
      <p className="text-xs font-bold text-muted">{label}</p>
      {amounts.length === 0 ? (
        <p className="mt-1 text-lg text-muted">Nothing</p>
      ) : (
        <ul className="mt-1 space-y-0.5">
          {amounts.map((m) => <li key={m.currency} className="text-xl font-extrabold">{money(m)}</li>)}
        </ul>
      )}
    </div>
  );
}

/**
 * "Payments due": totals per currency and every declared invoice with its deadline, as cards. Display only, so it
 * serves the owner (under the months) and a CA alike. `heading` is the level of its title (h1 when it is a page).
 */
export function TrackerView({ tracker, readOnly = false, heading = "h2" }: { tracker: TrackerWire; readOnly?: boolean; heading?: "h1" | "h2" }) {
  const nav = useNav();
  const { Link } = nav;
  const Heading = heading;
  return (
    <section aria-labelledby="payments-due-h" className="space-y-4">
      <div>
        <Heading id="payments-due-h" className={heading === "h1" ? "text-3xl" : "text-xl"}>Payments due</Heading>
        <p className="mt-1 max-w-prose text-sm text-muted">Exports must be realised within 9 months of the invoice date (12 for INR invoices).</p>
      </div>

      {tracker.rows.length === 0 ? (
        <EmptyState
          icon="💸"
          title="No payments to track yet"
          {...(readOnly ? {} : { action: <Link href={nav.hrefs.home()} className={buttonClass("secondary")}>Go to Home</Link> })}
        >
          Every invoice with a date and an amount shows up here, with the deadline for receiving the money.
        </EmptyState>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3" role="group" aria-label="Totals by currency">
            <Tile label="Outstanding" amounts={tracker.totals.outstanding} />
            <Tile label="Due within 60 days" amounts={tracker.totals.due60} tone="flag" />
            <Tile label="Overdue" amounts={tracker.totals.overdue} tone="danger" />
          </div>
          <TrackerTable rows={tracker.rows} asOf={tracker.asOf} />
        </>
      )}
    </section>
  );
}
