"use client";
import { useActionState, useEffect, useRef } from "react";
import type { AdBankWire, ExporterProfileWire } from "@korra/backend/schemas";
import { Alert, Button, Field, Input, Select, Textarea } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { saveBankAction, saveProfileAction } from "./actions";

const empty: FormState = {};

export function AddBankForm() {
  const [state, action, pending] = useActionState(saveBankAction, empty);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  const fe = state.fieldErrors ?? {};
  return (
    <form ref={ref} action={action} className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
      <Field id="bank-name" label="Bank name" error={fe.name}><Input id="bank-name" name="name" placeholder="e.g. ICICI Bank" required aria-invalid={!!fe.name} /></Field>
      <Field id="bank-ad" label="AD code" hint="The Authorised Dealer code your bank gave you." error={fe.adCode}><Input id="bank-ad" name="adCode" required aria-invalid={!!fe.adCode} /></Field>
      <div className="sm:pt-[1.65rem]"><Button type="submit" variant="secondary" disabled={pending}>{pending ? "Adding..." : "Add bank"}</Button></div>
      {state.error && !state.fieldErrors && <div className="sm:col-span-3"><Alert tone="danger">{state.error}</Alert></div>}
    </form>
  );
}

export function ProfileForm({ profile, banks }: { profile: ExporterProfileWire | null; banks: AdBankWire[] }) {
  const [state, action, pending] = useActionState(saveProfileAction, empty);
  const fe = state.fieldErrors ?? {};
  const p = profile;
  const v = (k: string, fallback?: string | null) => state.values?.[k] ?? fallback ?? "";
  return (
    <form action={action} className="space-y-4">
      <Field id="legalName" label="Legal name" hint="As on your PAN and GST registration." error={fe.legalName}>
        <Input id="legalName" name="legalName" defaultValue={v("legalName", p?.legalName)} required aria-invalid={!!fe.legalName} autoComplete="organization" />
      </Field>
      <Field id="address" label="Registered address" error={fe.address}>
        <Textarea id="address" name="address" rows={3} defaultValue={v("address", p?.address)} required aria-invalid={!!fe.address} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="pan" label="PAN" hint="Like ABCDE1234F" error={fe.pan}><Input id="pan" name="pan" defaultValue={v("pan", p?.pan)} required aria-invalid={!!fe.pan} className="uppercase" maxLength={10} /></Field>
        <Field id="gstin" label="GSTIN" hint="15 characters" error={fe.gstin}><Input id="gstin" name="gstin" defaultValue={v("gstin", p?.gstin)} required aria-invalid={!!fe.gstin} className="uppercase" maxLength={15} /></Field>
        <Field id="iec" label="IEC (optional)" hint="10 characters, if you have one" error={fe.iec}><Input id="iec" name="iec" defaultValue={v("iec", p?.iec)} aria-invalid={!!fe.iec} className="uppercase" maxLength={10} /></Field>
        <Field id="defaultSacCodes" label="Default SAC codes" hint="Separate with commas, e.g. 998314, 998313" error={fe.defaultSacCodes}>
          <Input id="defaultSacCodes" name="defaultSacCodes" defaultValue={v("defaultSacCodes", p?.defaultSacCodes.join(", "))} aria-invalid={!!fe.defaultSacCodes} />
        </Field>
      </div>
      <Field id="defaultAdBankId" label="Default AD bank" hint="New invoices are filed with this bank unless you change it." error={fe.defaultAdBankId}>
        <Select key={`bank-${state.values?.defaultAdBankId ?? ""}`} id="defaultAdBankId" name="defaultAdBankId" defaultValue={v("defaultAdBankId", p?.defaultAdBankId)} required disabled={banks.length === 0} aria-invalid={!!fe.defaultAdBankId}>
          <option value="" disabled>{banks.length ? "Choose a bank" : "Add a bank first"}</option>
          {banks.map((b) => <option key={b.id} value={b.id}>{b.name} ({b.adCode})</option>)}
        </Select>
      </Field>
      {state.error && !state.fieldErrors && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" disabled={pending || banks.length === 0}>{pending ? "Saving..." : "Save and continue"}</Button>
    </form>
  );
}
