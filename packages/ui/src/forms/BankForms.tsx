"use client";
import { useRef, useState, useTransition, type FormEvent } from "react";
import type { AdBankWire } from "@korra/backend/schemas";
import { Alert, Badge, Button, Field, Input } from "../components";
import { useApi } from "../context";
import { toFormErrors, type FormErrors } from "../errors";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export function AddBankForm({ onSaved }: { onSaved?: (() => void) | undefined }) {
  const api = useApi();
  const ref = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, start] = useTransition();
  const fe = errors.fieldErrors ?? {};

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErrors({});
    start(async () => {
      try {
        await api.saveBank({ name: str(fd, "name"), adCode: str(fd, "adCode") });
        ref.current?.reset();
        onSaved?.();
      } catch (err) {
        setErrors(toFormErrors(err));
      }
    });
  }

  return (
    <form ref={ref} onSubmit={submit} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
      <Field id="bank-name" label="Bank name" error={fe.name}><Input id="bank-name" name="name" placeholder="e.g. ICICI Bank" required aria-invalid={!!fe.name} /></Field>
      <Field id="bank-ad" label="AD code" hint="The Authorised Dealer code your bank gave you." error={fe.adCode}><Input id="bank-ad" name="adCode" required aria-invalid={!!fe.adCode} /></Field>
      <div className="sm:pt-[1.65rem]"><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Adding..." : "Add bank"}</Button></div>
      {errors.error && !errors.fieldErrors && <div className="sm:col-span-3"><Alert tone="danger">{errors.error}</Alert></div>}
    </form>
  );
}

/** One bank in the settings list, with inline editing. */
export function BankRow({ bank, isDefault, onSaved }: { bank: AdBankWire; isDefault: boolean; onSaved?: (() => void) | undefined }) {
  const api = useApi();
  const [editing, setEditing] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, start] = useTransition();
  const fe = errors.fieldErrors ?? {};

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErrors({});
    start(async () => {
      try {
        await api.saveBank({ id: bank.id, name: str(fd, "name"), adCode: str(fd, "adCode") });
        setEditing(false);
        onSaved?.();
      } catch (err) {
        setErrors(toFormErrors(err));
      }
    });
  }

  if (!editing) {
    return (
      <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
        <span className="flex flex-wrap items-center gap-2">{bank.name} <span className="text-muted">AD code {bank.adCode}</span>{isDefault && <Badge tone="accent">Default</Badge>}</span>
        <Button size="sm" variant="ghost" onClick={() => setEditing(true)} aria-label={`Edit ${bank.name}`}>Edit</Button>
      </li>
    );
  }
  return (
    <li className="px-3 py-3">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <Field id={`bn-${bank.id}`} label="Bank name" error={fe.name}><Input id={`bn-${bank.id}`} name="name" defaultValue={bank.name} required autoFocus /></Field>
        <Field id={`ba-${bank.id}`} label="AD code" error={fe.adCode}><Input id={`ba-${bank.id}`} name="adCode" defaultValue={bank.adCode} required /></Field>
        <div className="flex gap-2 sm:pt-[1.65rem]">
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>Cancel</Button>
        </div>
        {errors.error && !errors.fieldErrors && <div className="sm:col-span-3"><Alert tone="danger">{errors.error}</Alert></div>}
      </form>
    </li>
  );
}
