import { REQUIRED_FIELDS } from "@korra/core";
import type { AdBankWire, InvoiceWire, RealisationWire } from "@korra/backend/schemas";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { FIELD_LABELS, dateLabel } from "@/lib/format";
import { needsCheck, type FieldKind } from "@/lib/fields";
import { EditableCell, type SaveAction } from "./EditableCell";

const FIELDS: { name: keyof InvoiceWire & string; kind: FieldKind }[] = [
  { name: "invoiceNo", kind: "text" }, { name: "invoiceDate", kind: "date" }, { name: "clientName", kind: "text" },
  { name: "clientAddress", kind: "text" }, { name: "clientCountry", kind: "country" }, { name: "amount", kind: "money" },
  { name: "netRealisableValue", kind: "money" }, { name: "serviceDescription", kind: "text" }, { name: "sacCode", kind: "text" },
  { name: "contractRef", kind: "text" }, { name: "adBankId", kind: "bankId" },
];
const REQUIRED: readonly string[] = REQUIRED_FIELDS.invoice;

export const invoiceAnchor = (id: string, field: string) => `inv-${id}-${field}`;

export function InvoicesSection({ invoices, banks, realisations, save }: {
  invoices: InvoiceWire[]; banks: AdBankWire[]; realisations: Record<string, RealisationWire>; save: SaveAction;
}) {
  return (
    <Card aria-labelledby="invoices-h" id="invoices">
      <CardHeader id="invoices-h" title="Invoices" description="What Korra read from your invoices. Fields it is unsure about are marked. Select any value to change it." />
      <CardBody className="space-y-6">
        {invoices.length === 0 && <p className="text-sm text-muted">No invoices for this month yet. Upload an invoice above.</p>}
        {invoices.map((inv) => {
          const flagged = FIELDS.filter((f) => needsCheck(inv[f.name] as never)).length;
          const r = realisations[inv.id];
          return (
            <article key={inv.id} aria-label={`Invoice ${inv.invoiceNo.value ?? "without number"}`} className="rounded-md border border-line">
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-bg px-4 py-2">
                <h3 className="font-medium">Invoice {inv.invoiceNo.value ?? "(no number)"}</h3>
                <div className="flex flex-wrap items-center gap-2">
                  {flagged > 0 && <Badge tone="flag">{flagged} to check</Badge>}
                  {r && <Badge tone={r.status === "realised" ? "ok" : r.status === "overdue" ? "danger" : "neutral"}>{r.status.replace("_", " ")}; due {dateLabel(r.deadline)}</Badge>}
                </div>
              </header>
              <dl className="divide-y divide-line text-sm">
                {FIELDS.map((f) => (
                  <div key={f.name} className="grid gap-1 px-4 py-2 sm:grid-cols-[12rem_1fr]">
                    <dt className="text-muted">{FIELD_LABELS[f.name]}</dt>
                    <dd>
                      <EditableCell entity="invoice" id={inv.id} field={f.name} kind={f.kind} data={inv[f.name] as never} banks={banks} save={save}
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
