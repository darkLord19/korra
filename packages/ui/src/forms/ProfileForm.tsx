"use client";
import { useRef, useState, useTransition, type FormEvent } from "react";
import { BANK_CATALOG, OTHER_BANK_KEY, findCatalogBank } from "@korra/core";
import type { AdBankWire, ExporterProfileWire } from "@korra/backend/schemas";
import { Alert, Button, Field, Input, Select, Textarea } from "../components";
import { useApi } from "../context";
import { toFormErrors, type FormErrors } from "../errors";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

const AD_HINT = "Usually 7 digits, from your bank's AD code letter. Not your IFSC. Leave blank if you don't have it; your bank can fill it in.";
const norm = (s: string) => s.trim().toLowerCase();

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
  // The bank the user picks: a catalog entry, or "Other bank" with a typed name. The bank row behind it is found or created on save.
  const current = banks.find((b) => b.id === p?.defaultAdBankId);
  const currentEntry = current && findCatalogBank(current.name);
  const [bankKey, setBankKey] = useState(current ? (currentEntry?.key ?? OTHER_BANK_KEY) : "");
  const [otherName, setOtherName] = useState(current && !currentEntry ? current.name : "");
  const [adCode, setAdCode] = useState(current?.adCode ?? "");
  const made = useRef(new Map<string, string>()); // banks created by this form, in case `banks` has not refreshed yet
  const entry = BANK_CATALOG.find((b) => b.key === bankKey);
  const bankName = (bankKey === OTHER_BANK_KEY ? otherName : entry?.name ?? "").trim();
  const existing = (name: string) => banks.find((b) => norm(b.name) === norm(name));
  const hint = entry?.adCodeHint && !adCode.trim() ? `${AD_HINT} ${entry.name}'s own EDF form uses ${entry.adCodeHint}. Confirm with your branch before using it.` : AD_HINT;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setErrors({});
    setSaved(false);
    start(async () => {
      try {
        const id = made.current.get(norm(bankName)) ?? existing(bankName)?.id;
        const bank = await api.saveBank({ ...(id && { id }), name: bankName, adCode });
        made.current.set(norm(bankName), bank.id);
        await api.saveProfile({
          legalName: str(fd, "legalName"),
          address: str(fd, "address"),
          pan: str(fd, "pan"),
          gstin: str(fd, "gstin"),
          iec: str(fd, "iec") || null,
          defaultSacCodes: str(fd, "defaultSacCodes").split(/[\s,]+/).filter(Boolean),
          defaultAdBankId: bank.id,
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
      <div className="grid gap-4 sm:grid-cols-2 sm:items-start">
        <div className="space-y-4">
          <Field id="bankKey" label="Which bank receives your foreign payments?" hint="New invoices are filed with this bank unless you change it." error={bankKey === OTHER_BANK_KEY ? undefined : fe.name ?? fe.defaultAdBankId}>
            <Select id="bankKey" value={bankKey} required aria-invalid={!!(fe.name ?? fe.defaultAdBankId)} onChange={(e) => { setBankKey(e.target.value); const k = BANK_CATALOG.find((b) => b.key === e.target.value); if (k) setAdCode(existing(k.name)?.adCode ?? ""); }}>
              <option value="" disabled>Choose your bank</option>
              {BANK_CATALOG.map((b) => <option key={b.key} value={b.key}>{b.name}</option>)}
              <option value={OTHER_BANK_KEY}>Other bank</option>
            </Select>
          </Field>
          {bankKey === OTHER_BANK_KEY && (
            <Field id="bankName" label="Bank name" error={fe.name ?? fe.defaultAdBankId}><Input id="bankName" value={otherName} onChange={(e) => setOtherName(e.target.value)} placeholder="e.g. Federal Bank" required aria-invalid={!!(fe.name ?? fe.defaultAdBankId)} /></Field>
          )}
        </div>
        <Field id="adCode" label="AD code (optional)" hint={hint} error={fe.adCode}><Input id="adCode" value={adCode} onChange={(e) => setAdCode(e.target.value)} aria-invalid={!!fe.adCode} /></Field>
      </div>
      {errors.error && !errors.fieldErrors && <Alert tone="danger">{errors.error}</Alert>}
      <Button type="submit" disabled={pending}>{pending ? "Saving..." : submitLabel}</Button>
      {saved && !errors.error && <Alert tone="success">Saved.</Alert>}
    </form>
  );
}
