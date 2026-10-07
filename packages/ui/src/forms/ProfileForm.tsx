"use client";
import { useEffect, useRef, useState, useTransition, type FormEvent } from "react";
import { BANK_CATALOG, OTHER_BANK_KEY, findCatalogBank, panFromGstin } from "@korra/core";
import type { AdBankWire, ExporterProfileWire, ProfileSuggestionWire } from "@korra/backend/schemas";
import { Alert, Button, Field, Input, Select, Textarea } from "../components";
import { useApi } from "../context";
import { toFormErrors, type FormErrors } from "../errors";
import { COULDNT_READ, InvoiceFill } from "./InvoiceFill";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");

const AD_HINT = "Usually 7 digits, from your bank's AD code letter. Not your IFSC. Leave blank if you don't have it; your bank can fill it in.";
const norm = (s: string) => s.trim().toLowerCase();

/** The invoice the form was filled from, so an app can file it once the profile is saved. `month` is the invoice date's month. */
export interface InvoiceHandoff { file: File; month: string | null }

export function ProfileForm({ profile, banks, submitLabel = "Save and continue", fillFromInvoice = false, onSaved }: {
  profile: ExporterProfileWire | null; banks: AdBankWire[]; submitLabel?: string;
  /** Offer "Have an invoice handy? Drop it here to fill this in" (onboarding). */
  fillFromInvoice?: boolean;
  /** Called after the profile was saved (onboarding goes to the app; settings reloads). `invoice` is set when the form was filled from one. */
  onSaved?: ((invoice?: InvoiceHandoff) => void) | undefined;
}) {
  const api = useApi();
  const [errors, setErrors] = useState<FormErrors>({});
  const [saved, setSaved] = useState(false);
  const [pending, start] = useTransition();
  const fe = errors.fieldErrors ?? {};
  const p = profile;
  const [legalName, setLegalName] = useState(p?.legalName ?? "");
  const [address, setAddress] = useState(p?.address ?? "");
  const [gstin, setGstin] = useState(p?.gstin ?? "");
  const [pan, setPan] = useState(p?.pan ?? "");
  const [iec, setIec] = useState(p?.iec ?? "");
  const gstinPan = panFromGstin(gstin);
  const panMismatch = gstinPan !== null && pan.trim().length === 10 && pan.trim().toUpperCase() !== gstinPan;
  // A full GSTIN carries the PAN: fill it in when the PAN is still empty (it stays editable).
  const changeGstin = (v: string) => { setGstin(v); const fromGstin = panFromGstin(v); if (fromGstin && !pan.trim()) setPan(fromGstin); };
  // The bank the user picks: a catalog entry, or "Other bank" with a typed name. The bank row behind it is found or created on save.
  const current = banks.find((b) => b.id === p?.defaultAdBankId);
  const currentEntry = current && findCatalogBank(current.name);
  const [bankKey, setBankKey] = useState(current ? (currentEntry?.key ?? OTHER_BANK_KEY) : "");
  const [otherName, setOtherName] = useState(current && !currentEntry ? current.name : "");
  const [adCode, setAdCode] = useState(current?.adCode ?? "");
  const [invoice, setInvoice] = useState<InvoiceHandoff | null>(null);
  const made = useRef(new Map<string, string>()); // banks created by this form, in case `banks` has not refreshed yet
  const entry = BANK_CATALOG.find((b) => b.key === bankKey);
  const bankName = (bankKey === OTHER_BANK_KEY ? otherName : entry?.name ?? "").trim();
  const existing = (name: string) => banks.find((b) => norm(b.name) === norm(name));
  const hint = entry?.adCodeHint && !adCode.trim() ? `${AD_HINT} ${entry.name}'s own EDF form uses ${entry.adCodeHint}. Confirm with your branch before using it.` : AD_HINT;

  // What the form holds now, for `fill` to read after the invoice has been read (the user may have typed meanwhile).
  const latest = useRef({ legalName, address, gstin, pan, bankKey, adCode });
  useEffect(() => { latest.current = { legalName, address, gstin, pan, bankKey, adCode }; });

  /** Puts a suggestion into the EMPTY fields only, and says which. Nothing is saved. */
  function fill(s: ProfileSuggestionWire, file: File): { tone: "success" | "info" | "warning"; message: string } {
    const c = latest.current;
    const empty = (v: string) => !v.trim();
    const filled: string[] = [];
    if (s.legalName && empty(c.legalName)) { setLegalName(s.legalName); filled.push("name"); }
    if (s.address && empty(c.address)) { setAddress(s.address); filled.push("address"); }
    const g = empty(c.gstin) ? s.gstin : null;
    if (g) { setGstin(g); filled.push("GSTIN"); }
    const p = empty(c.pan) ? (panFromGstin(c.gstin) ?? panFromGstin(g ?? "") ?? s.pan) : null;
    if (p) { setPan(p); filled.push("PAN"); }
    if (empty(c.bankKey)) {
      const k = BANK_CATALOG.find((b) => b.key === s.bankKey);
      if (k || s.otherBankName) {
        setBankKey(k ? k.key : OTHER_BANK_KEY);
        if (k && empty(c.adCode)) setAdCode(existing(k.name)?.adCode ?? "");
        if (!k) setOtherName(s.otherBankName!);
        filled.push("bank");
      }
    }
    if (![s.legalName, s.address, s.gstin, s.pan, s.bankKey, s.otherBankName].some(Boolean)) return { tone: "warning", message: COULDNT_READ };
    setInvoice({ file, month: s.invoiceMonth });
    if (filled.length === 0) return { tone: "info", message: `Read ${file.name}, but everything it covers is already filled in.` };
    return { tone: "success", message: `Filled from ${file.name}: ${filled.join(", ")}. Check them before saving.` };
  }

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
          defaultSacCodes: p?.defaultSacCodes ?? [], // no longer asked for (SAC is per invoice); kept as stored
          defaultAdBankId: bank.id,
        });
        setSaved(true);
        onSaved?.(invoice ?? undefined);
      } catch (err) {
        setErrors(toFormErrors(err));
      }
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {fillFromInvoice && <InvoiceFill apply={fill} />}
      <Field id="legalName" label="Legal name" hint="As on your PAN and GST registration." error={fe.legalName}>
        <Input id="legalName" name="legalName" value={legalName} onChange={(e) => setLegalName(e.target.value)} required aria-invalid={!!fe.legalName} autoComplete="organization" />
      </Field>
      <Field id="address" label="Registered address" error={fe.address}>
        <Textarea id="address" name="address" rows={3} value={address} onChange={(e) => setAddress(e.target.value)} required aria-invalid={!!fe.address} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="gstin" label="GSTIN" hint="15 characters" error={fe.gstin}><Input id="gstin" name="gstin" value={gstin} onChange={(e) => changeGstin(e.target.value)} required aria-invalid={!!fe.gstin} className="uppercase" maxLength={15} /></Field>
        <div className="space-y-1.5">
          <Field id="pan" label="PAN" hint="Like ABCDE1234F. Filled in from your GSTIN if empty." error={fe.pan}><Input id="pan" name="pan" value={pan} onChange={(e) => setPan(e.target.value)} required aria-invalid={!!fe.pan} aria-describedby={panMismatch ? "pan-mismatch" : undefined} className="uppercase" maxLength={10} /></Field>
          {panMismatch && <p id="pan-mismatch" className="text-xs text-flag">Doesn't match the PAN inside your GSTIN ({gstinPan}).</p>}
        </div>
        <Field id="iec" label="IEC (optional)" hint="10 characters, if you have one" error={fe.iec}><Input id="iec" name="iec" value={iec} onChange={(e) => setIec(e.target.value)} aria-invalid={!!fe.iec} className="uppercase" maxLength={10} /></Field>
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
