"use client";
import { useState } from "react";
import type { AdBankWire, DocumentWire, PaymentWire } from "@korra/backend/schemas";
import { Badge, Button, Card, CardBody, CardHeader, Table, Td, Th } from "../components";
import { FIELD_LABELS } from "../lib/format";
import { needsCheck, type FieldKind } from "../lib/fields";
import { ConfirmAllButton } from "./ConfirmAllButton";
import { EditableCell } from "./EditableCell";
import { ManualPaymentForm } from "./ManualEntry";
import { NocSelect } from "./NocSelect";

const COLS: { name: keyof PaymentWire & string; kind: FieldKind }[] = [
  { name: "payerName", kind: "text" }, { name: "date", kind: "date" }, { name: "receiptMode", kind: "receiptMode" },
  { name: "foreignAmount", kind: "money" }, { name: "inrCredited", kind: "money" }, { name: "firaRef", kind: "text" }, { name: "purposeCode", kind: "text" },
];

export function PaymentsSection({ month, payments, documents, banks, readOnly = false, onChanged }: {
  month: string; payments: PaymentWire[]; documents: DocumentWire[]; banks: AdBankWire[]; readOnly?: boolean; onChanged?: (() => void) | undefined;
}) {
  const [adding, setAdding] = useState(false);
  const nocs = documents.filter((d) => d.kind === "noc");
  const nameOf = (id: string | null) => documents.find((d) => d.id === id)?.filename;
  return (
    <Card aria-labelledby="payments-h" id="payments">
      <CardHeader
        id="payments-h"
        title="Payments"
        description="Money received for your exports, read from your statement or FIRA. Payments never block an EDF pack; they are used to match invoices and track realisation."
        action={!readOnly && !adding ? <Button size="sm" variant="secondary" onClick={() => setAdding(true)}>Add payment by hand</Button> : undefined}
      />
      <CardBody className="space-y-3 px-0">
        {!readOnly && adding && (
          <div className="px-5"><ManualPaymentForm month={month} onCancel={() => setAdding(false)} onDone={() => { setAdding(false); onChanged?.(); }} /></div>
        )}
        {payments.length === 0 ? (
          <p className="px-5 text-sm text-muted">{readOnly ? "No payments for this month." : "No payments yet. Upload your Deel transactions export or a FIRA above."}</p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Payer</Th><Th>Date</Th>
                <Th><span title="Local transfer: the payment platform's Indian bank paid you in INR. SWIFT: foreign currency was sent to your AD bank, which issues the FIRA.">Receipt mode (?)</span></Th>
                <Th>Foreign amount</Th><Th>INR credited</Th><Th>FIRA ref</Th><Th>Purpose code</Th><Th>Rail</Th><Th>NOC</Th>{!readOnly && <Th>Review</Th>}
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id}>
                  {COLS.map((c) => (
                    <Td key={c.name} className={c.kind === "date" ? "whitespace-nowrap" : ""}>
                      <EditableCell entity="payment" id={p.id} field={c.name} kind={c.kind} data={p[c.name] as never} banks={banks} readOnly={readOnly} onChanged={onChanged}
                        anchor={`pay-${p.id}-${c.name}`} label={FIELD_LABELS[c.name]!} />
                    </Td>
                  ))}
                  <Td><Badge>{p.rail === "deel" ? "Deel" : "Other"}</Badge></Td>
                  <Td>
                    {p.nocDocumentId ? <Badge tone="ok">{nameOf(p.nocDocumentId) ?? "NOC linked"}</Badge>
                      : nocs.length > 0 && !readOnly ? <NocSelect paymentId={p.id} options={nocs} onChanged={onChanged} /> : <span className="text-xs text-muted">None</span>}
                  </Td>
                  {!readOnly && (
                    <Td>{COLS.some((c) => needsCheck(p[c.name] as never)) && <ConfirmAllButton entity="payment" id={p.id} label={`payment from ${p.payerName.value ?? "unknown payer"}`} onChanged={onChanged} />}</Td>
                  )}
                </tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="px-5 text-xs text-muted">
          <strong>Local transfer</strong>: the payment platform&rsquo;s Indian bank paid you in INR, so your bank saw a domestic credit and there is usually no FIRA.{" "}
          <strong>SWIFT</strong>: foreign currency was sent to your AD bank, which issues the FIRA (it may need a NOC from the platform first).
        </p>
      </CardBody>
    </Card>
  );
}
