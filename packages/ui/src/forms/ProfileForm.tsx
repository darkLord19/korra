"use client";
import { useState, useTransition, type FormEvent } from "react";
import type { AdBankWire, ExporterProfileWire } from "@korra/backend/schemas";
import { Alert, Button, Field, Input, Select, Textarea } from "../components";
import { useApi } from "../context";
import { toFormErrors, type FormErrors } from "../errors";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

export function ProfileForm({ profile, banks, submitLabel = "Save and continue", onSaved }: {
  profile: ExporterProfileWire | null; banks: AdBankWire[]; submitLabel?: string;
  /** Called after the profile was saved (onboarding goes to the app; settings reloads). */
  onSaved?: (() => void) | undefined;
}) {
  const api = useApi();
  const [errors, setErrors] = useState<FormErrors>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const fe = errors.fieldErrors ?? {};
  const p = profile;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErrors({});
    setSaved(false);
    start(async () => {
      try {
        await api.saveProfile({
          legalName: str(fd, "legalName"),
          address: str(fd, "address"),
          pan: str(fd, "pan"),
          gstin: str(fd, "gstin"),
          iec: str(fd, "iec") || null,
          defaultSacCodes: str(fd, "defaultSacCodes").split(/[\s,]+/).filter(Boolean),
          defaultAdBankId: str(fd, "defaultAdBankId"),
        });
        setSaved(true);
        onSaved?.();
      } catch (err) {
        setErrors(toFormErrors(err));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field id="legalName" label="Legal name" hint="As on your PAN and GST registration." error={fe.legalName}>
        <Input id="legalName" name="legalName" defaultValue={p?.legalName ?? ""} required aria-invalid={!!fe.legalName} autoComplete="organization" />
      </Field>
      <Field id="address" label="Registered address" error={fe.address}>
        <Textarea id="address" name="address" rows={3} defaultValue={p?.address ?? ""} required aria-invalid={!!fe.address} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pan" label="PAN" hint="Like ABCDE1234F" error={fe.pan}><Input id="pan" name="pan" defaultValue={p?.pan ?? ""} required aria-invalid={!!fe.pan} className="uppercase" maxLength={10} /></Field>
        <Field id="gstin" label="GSTIN" hint="15 characters" error={fe.gstin}><Input id="gstin" name="gstin" defaultValue={p?.gstin ?? ""} required aria-invalid={!!fe.gstin} className="uppercase" maxLength={15} /></Field>
        <Field id="iec" label="IEC (optional)" hint="10 characters, if you have one" error={fe.iec}><Input id="iec" name="iec" defaultValue={p?.iec ?? ""} aria-invalid={!!fe.iec} className="uppercase" maxLength={10} /></Field>
        <Field id="defaultSacCodes" label="Default SAC codes" hint="Separate with commas, e.g. 998314, 998313" error={fe.defaultSacCodes}>
          <Input id="defaultSacCodes" name="defaultSacCodes" defaultValue={p?.defaultSacCodes.join(", ") ?? ""} aria-invalid={!!fe.defaultSacCodes} />
        </Field>
      </div>
      <Field id="defaultAdBankId" label="Default AD bank" hint="New invoices are filed with this bank unless you change it." error={fe.defaultAdBankId}>
        <Select id="defaultAdBankId" name="defaultAdBankId" defaultValue={p?.defaultAdBankId ?? ""} required disabled={banks.length === 0} aria-invalid={!!fe.defaultAdBankId}>
          <option value="" disabled>{banks.length ? "Choose a bank" : "Add a bank first"}</option>
          {banks.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.adCode})</option>)}
        </Select>
      </Field>
      {errors.error && !errors.fieldErrors && <Alert tone="danger">{errors.error}</Alert>}
      <Button type="submit" disabled={pending || banks.length === 0}>{pending ? "Saving..." : submitLabel}</Button>
      {saved && !errors.error && <Alert tone="success">Saved.</Alert>}
    </form>
  );
}
