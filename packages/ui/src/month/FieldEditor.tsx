"use client";
import { useId, useState, useTransition, type FormEvent } from "react";
import type { AdBankWire, MoneyWire } from "@korra/backend/schemas";
import { Button, Input, Select, cx } from "../components";
import { useApi } from "../context";
import { errorMessage } from "../errors";
import { RECEIPT_MODES, type FieldData, type FieldKind } from "../lib/fields";
import { dateLabel, money } from "../lib/format";
import { majorToMinor, minorToMajor } from "../lib/money-input";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** How a field value reads on screen ("" when it has none). Dates read as "2 Sep 2026"; the date input keeps ISO. */
export function displayField(kind: FieldKind, value: unknown, banks: AdBankWire[]): string {
  if (value === null || value === undefined || value === "") return "";
  if (kind === "money") return money(value as MoneyWire);
  if (kind === "date" && ISO_DATE.test(String(value))) return dateLabel(String(value));
  if (kind === "receiptMode") return RECEIPT_MODES[value as keyof typeof RECEIPT_MODES] ?? String(value);
  if (kind === "bankId") return banks.find((b) => b.id === value)?.name ?? "Unknown bank";
  return String(value);
}

/**
 * The input for one field, by kind, with Save (and Cancel when `onCancel` is given). Money is typed in major units
 * and converted to minor units here, once. Saves through `api.editField` (the backend owns the rules) and shows its error.
 */
export function FieldEditor({ entity, id, field, kind, data, banks, label, onSaved, onCancel, submitLabel = "Save", anchor }: {
  entity: "invoice" | "payment"; id: string; field: string; kind: FieldKind; data: FieldData; banks: AdBankWire[]; label: string;
  /** Called after the value was saved. */
  onSaved: () => void;
  onCancel?: (() => void) | undefined;
  submitLabel?: string;
  /** The form's DOM id (month pages link to it). */
  anchor?: string | undefined;
}) {
  const api = useApi();
  const uid = useId();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const m = data.value as MoneyWire | null;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    let value: unknown;
    if (kind === "money") {
      const cur = String(fd.get("currency") ?? "").trim().toUpperCase();
      const raw = String(fd.get("amount") ?? "").trim();
      if (raw === "") value = null;
      else {
        const minor = majorToMinor(raw, cur);
        if (minor === null) { setError(`Enter an amount in ${cur || "the currency"} with the right number of decimals.`); return; }
        value = { minor, currency: cur };
      }
    } else value = String(fd.get("value") ?? "");
    setError(null);
    start(async () => {
      try {
        await api.editField({ entity, id, field, value });
        onSaved();
      } catch (err) {
        setError(errorMessage(err).replace(/^[\w.]+: /, ""));
      }
    });
  }

  const fid = `${anchor ?? `${uid}-${entity}-${id}-${field}`}-input`;
  return (
    <form id={anchor} onSubmit={submit} className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {kind === "money" ? (
          <>
            <Input id={fid} name="amount" aria-label={`${label} amount`} defaultValue={m ? minorToMajor(m.minor, m.currency) : ""} inputMode="decimal" className="w-32" autoFocus />
            <Input name="currency" aria-label={`${label} currency`} defaultValue={m?.currency ?? "USD"} maxLength={3} className="w-20 uppercase" />
          </>
        ) : kind === "receiptMode" ? (
          <Select id={fid} name="value" aria-label={label} defaultValue={String(data.value ?? "")} className="w-44" autoFocus>
            <option value="">Not set</option>
            <option value="local_transfer">Local transfer</option>
            <option value="swift">SWIFT</option>
          </Select>
        ) : kind === "bankId" ? (
          <Select id={fid} name="value" aria-label={label} defaultValue={String(data.value ?? "")} className="w-52" autoFocus>
            <option value="">Not set</option>
            {banks.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        ) : (
          <Input id={fid} name="value" aria-label={label} type={kind === "date" ? "date" : "text"} defaultValue={String(data.value ?? "")}
            maxLength={kind === "country" ? 2 : undefined} placeholder={kind === "country" ? "US" : undefined} className={cx(kind === "date" ? "w-44" : "min-w-48")} autoFocus />
        )}
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : submitLabel}</Button>
        {onCancel && <Button size="sm" variant="ghost" onClick={() => { setError(null); onCancel(); }} disabled={pending}>Cancel</Button>}
      </div>
      {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </form>
  );
}
