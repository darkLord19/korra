"use client";
import { useId, useState, useTransition, type FormEvent } from "react";
import type { AdBankWire } from "@korra/backend/schemas";
import { Alert, Button, Field, Input, Select, cx } from "../components";
import { useApi } from "../context";
import { toFormErrors, type FormErrors } from "../errors";
import { FIELD_LABELS } from "../lib/format";
import { majorToMinor } from "../lib/money-input";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

/** First and last day of a "YYYY-MM" month, to hint the date inputs. */
function monthBounds(month: string): { min: string; max: string } {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
  return { min: `${month}-01`, max: `${month}-${String(last).padStart(2, "0")}` };
}

/**
 * Reads a money field (`<name>` amount + `<name>Currency`). Empty amount -> undefined. A bad amount returns a message.
 */
function readMoney(fd: FormData, name: string, label: string): { value?: { minor: string; currency: string }; error?: string } {
  const raw = str(fd, name);
  if (raw === "") return {};
  const currency = str(fd, `${name}Currency`).toUpperCase();
  const minor = /^[A-Z]{3}$/.test(currency) ? majorToMinor(raw, currency) : null;
  if (minor === null) return { error: `Enter ${label.toLowerCase()} as a number in a 3-letter currency, with the right number of decimals.` };
  return { value: { minor, currency } };
}

function MoneyField({ id, name, label, defaultCurrency, error, required, hint }: { id: string; name: string; label: string; defaultCurrency: string; error?: string | undefined; required?: boolean; hint?: string }) {
  return (
    <Field id={id} label={label} error={error} {...(hint ? { hint } : {})}>
      <div className="flex gap-2">
        <Input id={id} name={name} inputMode="decimal" required={required} aria-invalid={!!error} className="min-w-0 flex-1" />
        <Input name={`${name}Currency`} aria-label={`${label} currency`} defaultValue={defaultCurrency} maxLength={3} className="w-20 shrink-0 uppercase" />
      </div>
    </Field>
  );
}

function useEntryForm() {
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, start] = useTransition();
  return { errors, setErrors, pending, start };
}

export function ManualInvoiceForm({ month, banks, documentId, onDone, onCancel }: {
  month: string; banks: AdBankWire[]; documentId?: string | undefined; onDone: () => void; onCancel: () => void;
}) {
  const api = useApi();
  const uid = useId();
  const { errors, setErrors, pending, start } = useEntryForm();
  const fe = errors.fieldErrors ?? {};
  const bounds = monthBounds(month);
  const id = (k: string) => `${uid}-${k}`;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields: Record<string, unknown> = {};
    for (const k of ["invoiceNo", "invoiceDate", "clientName", "clientAddress", "serviceDescription", "sacCode", "contractRef", "adBankId"]) {
      if (str(fd, k)) fields[k] = str(fd, k);
    }
    if (str(fd, "clientCountry")) fields.clientCountry = str(fd, "clientCountry").toUpperCase();
    const amount = readMoney(fd, "amount", FIELD_LABELS.amount!);
    if (amount.error) return setErrors({ fieldErrors: { amount: amount.error } });
    const nrv = readMoney(fd, "netRealisableValue", FIELD_LABELS.netRealisableValue!);
    if (nrv.error) return setErrors({ fieldErrors: { netRealisableValue: nrv.error } });
    if (amount.value) fields.amount = amount.value;
    // Left empty, the net realisable value is the invoice amount (the form says so).
    const net = nrv.value ?? amount.value;
    if (net) fields.netRealisableValue = net;
    setErrors({});
    start(async () => {
      try {
        await api.createInvoiceManually({ month, fields, ...(documentId ? { documentId } : {}) });
        onDone();
      } catch (err) {
        setErrors(toFormErrors(err));
      }
    });
  }

  return (
    <form aria-label="Add invoice by hand" onSubmit={submit} className="space-y-4 rounded-md border border-line bg-bg p-4">
      <p className="text-sm text-muted">Type the invoice in yourself. Values you enter count as checked. The invoice date must fall in this month.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id("invoiceNo")} label={FIELD_LABELS.invoiceNo!} error={fe.invoiceNo}><Input id={id("invoiceNo")} name="invoiceNo" required aria-invalid={!!fe.invoiceNo} /></Field>
        <Field id={id("invoiceDate")} label={FIELD_LABELS.invoiceDate!} error={fe.invoiceDate}><Input id={id("invoiceDate")} name="invoiceDate" type="date" min={bounds.min} max={bounds.max} required aria-invalid={!!fe.invoiceDate} /></Field>
        <Field id={id("clientName")} label={FIELD_LABELS.clientName!} error={fe.clientName}><Input id={id("clientName")} name="clientName" required aria-invalid={!!fe.clientName} /></Field>
        <Field id={id("clientCountry")} label={FIELD_LABELS.clientCountry!} hint="2-letter code, like US" error={fe.clientCountry}><Input id={id("clientCountry")} name="clientCountry" maxLength={2} className="uppercase" required aria-invalid={!!fe.clientCountry} /></Field>
        <Field id={id("clientAddress")} label={FIELD_LABELS.clientAddress!} error={fe.clientAddress}><Input id={id("clientAddress")} name="clientAddress" required aria-invalid={!!fe.clientAddress} /></Field>
        <MoneyField id={id("amount")} name="amount" label={FIELD_LABELS.amount!} defaultCurrency="USD" error={fe.amount} required />
        <MoneyField id={id("netRealisableValue")} name="netRealisableValue" label={FIELD_LABELS.netRealisableValue!} defaultCurrency="USD" error={fe.netRealisableValue} hint="Leave empty if it equals the invoice amount." />
        <Field id={id("serviceDescription")} label={FIELD_LABELS.serviceDescription!} error={fe.serviceDescription}><Input id={id("serviceDescription")} name="serviceDescription" required aria-invalid={!!fe.serviceDescription} /></Field>
        <Field id={id("sacCode")} label={FIELD_LABELS.sacCode!} hint="4 to 8 digits" error={fe.sacCode}><Input id={id("sacCode")} name="sacCode" inputMode="numeric" required aria-invalid={!!fe.sacCode} /></Field>
        <Field id={id("contractRef")} label={FIELD_LABELS.contractRef!} error={fe.contractRef}><Input id={id("contractRef")} name="contractRef" aria-invalid={!!fe.contractRef} /></Field>
        {banks.length > 1 && (
          <Field id={id("adBankId")} label={FIELD_LABELS.adBankId!} hint="Leave as default to use your default bank." error={fe.adBankId}>
            <Select id={id("adBankId")} name="adBankId" defaultValue="" aria-invalid={!!fe.adBankId}>
              <option value="">Default bank</option>
              {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
        )}
      </div>
      {errors.error && !errors.fieldErrors && <Alert tone="danger">{errors.error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save invoice"}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
      </div>
    </form>
  );
}

export function ManualPaymentForm({ month, documentId, onDone, onCancel }: {
  month: string; documentId?: string | undefined; onDone: () => void; onCancel: () => void;
}) {
  const api = useApi();
  const uid = useId();
  const { errors, setErrors, pending, start } = useEntryForm();
  const fe = errors.fieldErrors ?? {};
  const bounds = monthBounds(month);
  const id = (k: string) => `${uid}-${k}`;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const fields: Record<string, unknown> = {};
    for (const k of ["payerName", "date", "receiptMode", "firaRef", "purposeCode"]) if (str(fd, k)) fields[k] = str(fd, k);
    const foreign = readMoney(fd, "foreignAmount", FIELD_LABELS.foreignAmount!);
    if (foreign.error) return setErrors({ fieldErrors: { foreignAmount: foreign.error } });
    const inr = readMoney(fd, "inrCredited", FIELD_LABELS.inrCredited!);
    if (inr.error) return setErrors({ fieldErrors: { inrCredited: inr.error } });
    if (foreign.value) fields.foreignAmount = foreign.value;
    if (inr.value) fields.inrCredited = inr.value;
    setErrors({});
    start(async () => {
      try {
        await api.createPaymentManually({ fields, ...(documentId ? { documentId } : {}) });
        onDone();
      } catch (err) {
        setErrors(toFormErrors(err));
      }
    });
  }

  return (
    <form aria-label="Add payment by hand" onSubmit={submit} className="space-y-4 rounded-md border border-line bg-bg p-4">
      <p className="text-sm text-muted">Type the payment in yourself. Values you enter count as checked. A payment is listed under the month of its date.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id={id("payerName")} label={FIELD_LABELS.payerName!} error={fe.payerName}><Input id={id("payerName")} name="payerName" aria-invalid={!!fe.payerName} /></Field>
        <Field id={id("date")} label={FIELD_LABELS.date!} error={fe.date}><Input id={id("date")} name="date" type="date" min={bounds.min} max={bounds.max} required aria-invalid={!!fe.date} /></Field>
        <MoneyField id={id("foreignAmount")} name="foreignAmount" label={FIELD_LABELS.foreignAmount!} defaultCurrency="USD" error={fe.foreignAmount} required />
        <MoneyField id={id("inrCredited")} name="inrCredited" label={FIELD_LABELS.inrCredited!} defaultCurrency="INR" error={fe.inrCredited} />
        <Field id={id("receiptMode")} label={FIELD_LABELS.receiptMode!} error={fe.receiptMode}>
          <Select id={id("receiptMode")} name="receiptMode" defaultValue="" aria-invalid={!!fe.receiptMode}>
            <option value="">Not set</option>
            <option value="local_transfer">Local transfer</option>
            <option value="swift">SWIFT</option>
          </Select>
        </Field>
        <Field id={id("firaRef")} label={FIELD_LABELS.firaRef!} error={fe.firaRef}><Input id={id("firaRef")} name="firaRef" aria-invalid={!!fe.firaRef} /></Field>
        <Field id={id("purposeCode")} label={FIELD_LABELS.purposeCode!} error={fe.purposeCode}><Input id={id("purposeCode")} name="purposeCode" aria-invalid={!!fe.purposeCode} /></Field>
      </div>
      {errors.error && !errors.fieldErrors && <Alert tone="danger">{errors.error}</Alert>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending ? "Saving..." : "Save payment"}</Button>
        <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
      </div>
    </form>
  );
}

/** For a document Korra could not read: choose invoice or payment, then type it in. The document id is attached. */
export function ManualEntryPanel({ month, documentId, banks, onDone, onCancel }: {
  month: string; documentId: string; banks: AdBankWire[]; onDone: () => void; onCancel: () => void;
}) {
  const [kind, setKind] = useState<"invoice" | "payment">("invoice");
  return (
    <div className="space-y-3">
      <div role="group" aria-label="What does this file contain?" className="flex gap-2">
        {(["invoice", "payment"] as const).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
            className={cx("rounded-md border px-3 py-1 text-sm", kind === k ? "border-accent bg-accent-soft font-medium" : "border-line bg-surface")}>
            {k === "invoice" ? "An invoice" : "A payment"}
          </button>
        ))}
      </div>
      {kind === "invoice"
        ? <ManualInvoiceForm month={month} banks={banks} documentId={documentId} onDone={onDone} onCancel={onCancel} />
        : <ManualPaymentForm month={month} documentId={documentId} onDone={onDone} onCancel={onCancel} />}
    </div>
  );
}
