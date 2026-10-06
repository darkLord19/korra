"use client";
import type { AllocationWire, InvoiceWire, PaymentWire } from "@korra/backend/schemas";
import { Card, CardBody, CardHeader } from "../components";
import { dateLabel, money } from "../lib/format";
import { MatchButtons } from "./MatchButtons";

export function MatchesSection({ allocations, invoices, payments, readOnly = false, onChanged }: { allocations: AllocationWire[]; invoices: InvoiceWire[]; payments: PaymentWire[]; readOnly?: boolean; onChanged?: (() => void) | undefined }) {
  const proposed = allocations.filter((a) => a.status === "proposed");
  const confirmed = allocations.filter((a) => a.status === "confirmed");
  const inv = (id: string) => invoices.find((i) => i.id === id);
  const pay = (id: string) => payments.find((p) => p.id === id);
  const row = (a: AllocationWire) => {
    const i = inv(a.invoiceId), p = pay(a.paymentId);
    return (
      <li key={`${a.invoiceId}:${a.paymentId}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-sm">
        <div>
          <p><span className="font-medium">Invoice {i?.invoiceNo.value ?? "(other month)"}</span> and payment of {money(p?.foreignAmount.value) || "unknown amount"}{p?.date.value ? ` on ${dateLabel(p.date.value)}` : ""}{p?.payerName.value ? ` from ${p.payerName.value}` : ""}</p>
          <p className="text-xs text-muted">Allocates {money(a.amount)}{a.status === "proposed" ? `; match score ${Math.round(a.score * 100)}%` : ""}</p>
        </div>
        {!readOnly && <MatchButtons invoiceId={a.invoiceId} paymentId={a.paymentId} status={a.status as "proposed" | "confirmed"} onChanged={onChanged} />}
      </li>
    );
  };
  return (
    <Card aria-labelledby="matches-h" id="matches">
      <CardHeader id="matches-h" title="Matches" description={readOnly ? "Which payment settles which invoice. Only confirmed matches count towards realisation." : "Korra suggests which payment settles which invoice. Confirm the ones that are right; confirmed matches count towards realisation."} />
      <CardBody className="space-y-5 px-0">
        <div>
          <h3 className="px-5 pb-2 text-sm font-medium">To review ({proposed.length})</h3>
          {proposed.length === 0 ? <p className="px-5 text-sm text-muted">Nothing to review.</p> : <ul className="divide-y divide-line border-y border-line">{proposed.map(row)}</ul>}
        </div>
        {confirmed.length > 0 && (
          <div>
            <h3 className="px-5 pb-2 text-sm font-medium">Confirmed ({confirmed.length})</h3>
            <ul className="divide-y divide-line border-y border-line">{confirmed.map(row)}</ul>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
