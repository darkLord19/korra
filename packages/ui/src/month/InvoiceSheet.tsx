"use client";
import { REQUIRED_FIELDS } from "@korra/core";
import type { AdBankWire, InvoiceWire, RealisationWire } from "@korra/backend/schemas";
import { Badge, Sheet } from "../components";
import { FIELD_LABELS } from "../lib/format";
import { INVOICE_FIELDS, flaggedCount, needsCheck } from "../lib/fields";
import { ConfirmAllButton } from "./ConfirmAllButton";
import { EditableCell } from "./EditableCell";
import { realisationLabel, realisationTone } from "./InvoiceCard";

const REQUIRED: readonly string[] = REQUIRED_FIELDS.invoice;

/** The id each invoice field's cell carries, so a link can point at it. */
export const invoiceAnchor = (id: string, field: string) => `inv-${id}-${field}`;

/**
 * Every field of one invoice, the ones to check first. Each is editable (unless `readOnly`). Keep it mounted and
 * pass `invoice={null}` when closed, so focus goes back to the card that opened it.
 */
export function InvoiceSheet({ invoice, banks, realisation, readOnly = false, onClose, onChanged }: {
  invoice: InvoiceWire | null; banks: AdBankWire[]; realisation?: RealisationWire | undefined; readOnly?: boolean;
  onClose: () => void; onChanged?: (() => void) | undefined;
}) {
  const flagged = invoice ? flaggedCount(invoice) : 0;
  const fields = invoice
    ? [...INVOICE_FIELDS].sort((a, b) => Number(needsCheck(invoice[b.name] as never)) - Number(needsCheck(invoice[a.name] as never)))
    : [];
  const no = invoice?.invoiceNo.value ?? "(no number)";
  return (
    <Sheet open={invoice !== null} onClose={onClose} title={`Invoice ${no}`}>
      {invoice && (
        <div className="space-y-4">
          {(flagged > 0 || realisation) && (
            <div className="flex flex-wrap items-center gap-2">
              {flagged > 0 && <Badge tone="flag">{flagged} to check</Badge>}
              {realisation && <Badge tone={realisationTone(realisation)}>{realisationLabel(realisation)}</Badge>}
              {flagged > 0 && !readOnly && <ConfirmAllButton entity="invoice" id={invoice.id} label={`invoice ${invoice.invoiceNo.value ?? "without number"}`} onChanged={onChanged} />}
            </div>
          )}
          <dl className="divide-y divide-line text-sm">
            {fields.map((f) => (
              <div key={f.name} className="grid gap-1 py-3">
                <dt className="text-xs font-bold text-muted">{FIELD_LABELS[f.name]}</dt>
                <dd>
                  <EditableCell
                    entity="invoice" id={invoice.id} field={f.name} kind={f.kind} data={invoice[f.name] as never} banks={banks}
                    readOnly={readOnly} onChanged={onChanged} anchor={invoiceAnchor(invoice.id, f.name)} label={FIELD_LABELS[f.name]!}
                    required={REQUIRED.includes(f.name)} showEdited={false}
                  />
                </dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </Sheet>
  );
}
