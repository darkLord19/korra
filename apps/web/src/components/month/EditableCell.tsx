"use client";
import { useState, useTransition, type FormEvent } from "react";
import type { AdBankWire, MoneyWire } from "@korra/backend/schemas";
import { Badge, Button, Input, Select, cx } from "@/components/ui";
import { RECEIPT_MODES, needsCheck, type FieldData, type FieldKind } from "@/lib/fields";
import { money } from "@/lib/format";
import { majorToMinor, minorToMajor } from "@/lib/money-input";

export type SaveAction = (input: { entity: "invoice" | "payment"; id: string; field: string; value: unknown }) => Promise<{ ok: true } | { ok: false; error: string }>;


function display(kind: FieldKind, value: unknown, banks: AdBankWire[]): string {
  if (value === null || value === undefined || value === "") return "";
  if (kind === "money") return money(value as MoneyWire);
  if (kind === "receiptMode") return RECEIPT_MODES[value as keyof typeof RECEIPT_MODES] ?? String(value);
  if (kind === "bankId") return banks.find((b) => b.id === value)?.name ?? "Unknown bank";
  return String(value);
}

/** A field value with a "Check this" marker and click-to-edit. All rules live in the backend's editField. */
export function EditableCell({ entity, id, field, kind, data, banks, save, anchor, label, required = false }: {
  entity: "invoice" | "payment"; id: string; field: string; kind: FieldKind; data: FieldData; banks: AdBankWire[];
  save: SaveAction; anchor?: string; label: string; required?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const m = data.value as MoneyWire | null;
  const text = display(kind, data.value, banks);
  const flagged = needsCheck(data);
  const missing = required && data.value === null;

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
      const r = await save({ entity, id, field, value });
      if (r.ok) setEditing(false);
      else setError(r.error.replace(/^[\w.]+: /, ""));
    });
  }

  if (!editing) {
    return (
      <div id={anchor} className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={`Edit ${label}`}
          className={cx("rounded px-1 py-0.5 text-left hover:bg-accent-soft", !text && "text-muted italic", (flagged || missing) && "bg-flag-soft")}
        >
          {text || (required ? "Missing - add" : "Add")}
        </button>
        {flagged && <Badge tone="flag">Check this</Badge>}
        {data.source === "user" && <span className="text-xs text-muted">edited</span>}
      </div>
    );
  }

  const fid = `${anchor ?? `${entity}-${id}-${field}`}-input`;
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
        <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
        <Button size="sm" variant="ghost" onClick={() => { setEditing(false); setError(null); }} disabled={pending}>Cancel</Button>
      </div>
      {error && <p role="alert" className="text-xs font-medium text-danger">{error}</p>}
    </form>
  );
}
