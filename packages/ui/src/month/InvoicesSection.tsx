"use client";
import { useState } from "react";
import { REQUIRED_FIELDS } from "@korra/core";
import type { AdBankWire, InvoiceWire, RealisationWire } from "@korra/backend/schemas";
import { Badge, Button, Card, CardBody, CardHeader } from "../components";
import { FIELD_LABELS, dateLabel } from "../lib/format";
import { INVOICE_FIELDS as FIELDS, flaggedCount } from "../lib/fields";
import { ConfirmAllButton } from "./ConfirmAllButton";
import { EditableCell } from "./EditableCell";
import { ManualInvoiceForm } from "./ManualEntry";

const REQUIRED: readonly string[] = REQUIRED_FIELDS.invoice;

const realisationLabel = (r: RealisationWire) => {
  switch (r.status) {
    case "open": return `Payment due by ${dateLabel(r.deadline)}`;
    case "partially_realised": return `Part paid · due by ${dateLabel(r.deadline)}`;
    case "overdue": return `Overdue since ${dateLabel(r.deadline)}`;
    case "realised": return "Realised";
  }
};

export const invoiceAnchor = (id: string, field: string) => `inv-${id}-${field}`;

export function InvoicesSection({ month, invoices, banks, realisations, lastSacCode, readOnly = false, onChanged }: {
  month: string; invoices: InvoiceWire[]; banks: AdBankWire[]; realisations: Record<string, RealisationWire>; lastSacCode?: string | null | undefined; readOnly?: boolean;
  onChanged?: (() => void) | undefined;
}) {
  const [adding, setAdding] = useState(false);
  return (
    <Card aria-labelledby="invoices-h" id="invoices">
      <CardHeader
        id="invoices-h"
        title="Invoices"
        description={readOnly ? "What Korra read from the invoices. Fields it was unsure about are marked." : "What Korra read from your invoices. Fields it is unsure about are marked. Select any value to change it."}
        action={!readOnly && !adding ? <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Add invoice by hand</Button> : undefined}
      />
      <CardBody className="space-y-6">
        {!readOnly && adding && (
          <ManualInvoiceForm month={month} banks={banks} lastSacCode={lastSacCode} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); onChanged?.(); }} />
        )}
        {invoices.length === 0 && <p className="text-sm text-muted">{readOnly ? "No invoices for this month." : "No invoices for this month yet. Upload an invoice above."}</p>}
        {invoices.map((inv) => {
          const flagged = flaggedCount(inv);
          const r = realisations[inv.id];
          return (
            <article key={inv.id} aria-label={`Invoice ${inv.invoiceNo.value ?? "without number"}`} className="rounded-md border border-line">
              <header className="flex flex-col gap-2 border-b border-line bg-bg px-4 py-2 sm:flex-row sm:items-center sm:justify-between">
                <h3 className="font-medium">Invoice {inv.invoiceNo.value ?? "(no number)"}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {flagged > 0 && <Badge tone="flag">{flagged} to check</Badge>}
                  {flagged > 0 && !readOnly && <ConfirmAllButton entity="invoice" id={inv.id} label={`invoice ${inv.invoiceNo.value ?? "without number"}`} onChanged={onChanged} />}
                  {r && <Badge tone={r.status === "realised" ? "ok" : r.status === "overdue" ? "danger" : "neutral"}>{realisationLabel(r)}</Badge>}
                </div>
              </header>
              <dl className="divide-y divide-line text-sm">
                {FIELDS.map((f) => (
                  <div key={f.name} className="grid gap-1 px-4 py-2 sm:grid-cols-[12rem_1fr]">
                    <dt className="text-muted">{FIELD_LABELS[f.name]}</dt>
                    <dd>
                      <EditableCell entity="invoice" id={inv.id} field={f.name} kind={f.kind} data={inv[f.name] as never} banks={banks} readOnly={readOnly} onChanged={onChanged}
                        anchor={invoiceAnchor(inv.id, f.name)} label={FIELD_LABELS[f.name]!} required={REQUIRED.includes(f.name)} />
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
          );
        })}
      </CardBody>
    </Card>
  );
}
