"use client";
import { useRef, useState, type ReactNode } from "react";
import { BANK_CATALOG, OTHER_BANK_KEY, findCatalogBank, panFromGstin } from "@korra/core";
import type { AdBankWire, OnboardingWire, ProfileSuggestionWire } from "@korra/backend/schemas";
import { Alert, Field, Input, Skeleton, Textarea, cx } from "../components";
import { useApi } from "../context";
import { toFormErrors, type FormErrors } from "../errors";
import { COULDNT_READ, InvoiceFill } from "../forms/InvoiceFill";
import { currentMonthIST } from "../lib/format";
import { panForGstinChange, panMismatch } from "../lib/profile";
import { useLoaded } from "../screens/useLoaded";
import { FlowFrame } from "./FlowFrame";
import type { FlowProps } from "./types";

type Step = "drop" | "you" | "bank";
type Values = { legalName: string; address: string; gstin: string; pan: string; iec: string };
type Bank = { key: string; otherName: string };

const norm = (s: string) => s.trim().toLowerCase();
const PROFILE_FIELDS = ["legalName", "address", "gstin", "pan", "iec"];
const BANK_FIELDS = ["name", "adCode", "contactEmail", "branch", "defaultAdBankId"];

/** First-run setup in three steps: drop an invoice (or skip), check the details it gave, pick the bank. Saves the bank, then the profile, then files the invoice. */
export function SetupFlow(props: FlowProps) {
  const api = useApi();
  const { data: ob, error } = useLoaded<OnboardingWire>(() => api.getOnboarding(), undefined, "onboarding");
  if (!ob) {
    return (
      <FlowFrame title="Set up Korra" onClose={props.onClose}>
        {error ? <Alert tone="danger">{error}</Alert> : <Skeleton className="h-40" />}
      </FlowFrame>
    );
  }
  return <SetupSteps {...props} ob={ob} />;
}

function SummaryRow({ id, label, value, onChange, error, hint, note, multiline = false, upper = false, maxLength }: {
  id: string; label: string; value: string; onChange: (v: string) => void;
  error?: string | undefined; hint?: string; note?: ReactNode; multiline?: boolean; upper?: boolean; maxLength?: number;
}) {
  // A row that starts empty (or has an error) is an input and stays one while typing; the rest read as a summary with a pencil.
  const [open, setOpen] = useState(!value.trim());
  if (open || error) {
    return (
      <div className="space-y-1.5">
        <Field id={id} label={label} error={error} {...(hint ? { hint } : {})}>
          {multiline
            ? <Textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} />
            : <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} aria-invalid={!!error} className={cx(upper && "uppercase")} {...(maxLength ? { maxLength } : {})} />}
        </Field>
        {note}
      </div>
    );
  }
  return (
    <div className="flex items-start gap-3 rounded-xl bg-surface-soft px-4 py-3">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold text-muted">{label}</p>
        <p className="whitespace-pre-line break-words font-medium">{value}</p>
        {note}
      </div>
      <button type="button" onClick={() => setOpen(true)} aria-label={`Edit ${label}`} className="inline-flex size-11 shrink-0 items-center justify-center rounded-full text-lg text-muted hover:bg-accent-soft">
        <span aria-hidden="true">✎</span>
      </button>
    </div>
  );
}

function SetupSteps({ onDone, onClose, ob }: FlowProps & { ob: OnboardingWire }) {
  const api = useApi();
  const profile = ob.profile;
  const current = ob.banks.find((b) => b.id === profile?.defaultAdBankId);
  const currentEntry = current && findCatalogBank(current.name);

  const [step, setStep] = useState<Step>("drop");
  const [values, setValues] = useState<Values>({ legalName: profile?.legalName ?? "", address: profile?.address ?? "", gstin: profile?.gstin ?? "", pan: profile?.pan ?? "", iec: profile?.iec ?? "" });
  const [showIec, setShowIec] = useState(!!profile?.iec);
  const [bank, setBank] = useState<Bank>({ key: current ? (currentEntry?.key ?? OTHER_BANK_KEY) : "", otherName: current && !currentEntry ? current.name : "" });
  const [bankFromInvoice, setBankFromInvoice] = useState(false);
  const [invoice, setInvoice] = useState<{ file: File; month: string | null } | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [pending, setPending] = useState(false);
  const made = useRef(new Map<string, string>()); // banks created here, in case `ob.banks` is stale on a retry
  const fe = errors.fieldErrors ?? {};

  const entry = BANK_CATALOG.find((b) => b.key === bank.key);
  const bankName = (bank.key === OTHER_BANK_KEY ? bank.otherName : entry?.name ?? "").trim();
  const existing = (name: string): AdBankWire | undefined => ob.banks.find((b) => norm(b.name) === norm(name));

  const set = (k: keyof Values) => (v: string) => {
    setValues((prev) => {
      const next = { ...prev, [k]: v };
      if (k === "gstin") next.pan = panForGstinChange(v, prev.pan); // a full GSTIN carries the PAN
      return next;
    });
  };
  const row = (k: keyof Values, label: string, extra: Partial<Parameters<typeof SummaryRow>[0]> = {}) => (
    <SummaryRow id={`setup-${k}`} label={label} value={values[k]} onChange={set(k)} error={fe[k]} {...extra} />
  );

  /** Fills the EMPTY fields from the invoice and moves on to "Is this you?". Nothing is saved yet. */
  function apply(s: ProfileSuggestionWire, file: File): { tone: "success" | "info" | "warning"; message: string } {
    if (![s.legalName, s.address, s.gstin, s.pan, s.bankKey, s.otherBankName].some(Boolean)) return { tone: "warning", message: COULDNT_READ };
    setValues((prev) => {
      const gstin = prev.gstin.trim() ? prev.gstin : s.gstin ?? "";
      const pan = prev.pan.trim() ? prev.pan : panFromGstin(gstin) ?? s.pan ?? "";
      return { ...prev, legalName: prev.legalName.trim() ? prev.legalName : s.legalName ?? "", address: prev.address.trim() ? prev.address : s.address ?? "", gstin, pan };
    });
    const k = BANK_CATALOG.find((b) => b.key === s.bankKey);
    if (k || s.otherBankName) {
      setBank((prev) => (prev.key ? prev : k ? { key: k.key, otherName: "" } : { key: OTHER_BANK_KEY, otherName: s.otherBankName ?? "" }));
      setBankFromInvoice(true);
    }
    setInvoice({ file, month: s.invoiceMonth });
    setStep("you");
    return { tone: "success", message: `Read ${file.name}.` };
  }

  async function save() {
    setErrors({});
    setPending(true);
    try {
      const ex = made.current.get(norm(bankName)) ?? existing(bankName)?.id;
      const old = existing(bankName);
      // An existing bank keeps its own AD code, email and branch.
      const saved = await api.saveBank({
        ...(ex && { id: ex }),
        name: bankName,
        adCode: old?.adCode ?? "",
        ...(old?.contactEmail ? { contactEmail: old.contactEmail } : {}),
        ...(old?.branch ? { branch: old.branch } : {}),
      });
      made.current.set(norm(bankName), saved.id);
      await api.saveProfile({
        legalName: values.legalName,
        address: values.address,
        pan: values.pan,
        gstin: values.gstin,
        iec: values.iec.trim() || null,
        defaultSacCodes: profile?.defaultSacCodes ?? [], // not asked for here (SAC is per invoice); kept as stored
        defaultAdBankId: saved.id,
      });
    } catch (err) {
      const e = toFormErrors(err);
      setErrors(e);
      // Show the error where the field lives.
      const keys = Object.keys(e.fieldErrors ?? {});
      if (keys.some((k) => PROFILE_FIELDS.includes(k))) setStep("you");
      else if (keys.some((k) => BANK_FIELDS.includes(k))) setStep("bank");
      setPending(false);
      return;
    }
    const month = invoice?.month ?? currentMonthIST();
    try {
      if (invoice) await api.uploadFile(invoice.file, { month, hint: "invoice" });
    } catch (err) {
      setErrors({ error: `Your details are saved, but the invoice could not be filed. ${toFormErrors(err).error ?? ""}`.trim() });
      setPending(false);
      return;
    }
    setPending(false);
    onDone(`upload:${month}`);
  }

  const skipBank = bankFromInvoice && !!bankName;
  const total = skipBank ? 2 : 3;
  const generalError = errors.error && !errors.fieldErrors ? <Alert tone="danger">{errors.error}</Alert> : null;
  const detailsMissing = !(values.legalName.trim() && values.address.trim() && values.gstin.trim() && values.pan.trim());

  if (step === "drop") {
    return (
      <FlowFrame
        title="Drop an invoice"
        step={{ index: 0, total }}
        onClose={onClose}
        secondary={{ label: "No invoice handy? Fill it in yourself", onClick: () => setStep("you") }}
      >
        <p className="text-sm text-muted">Korra reads your own details off one of your export invoices, so you don't have to type them.</p>
        <InvoiceFill big apply={apply} />
      </FlowFrame>
    );
  }

  if (step === "you") {
    const mismatch = panMismatch(values.gstin, values.pan);
    return (
      <FlowFrame
        title="Is this you?"
        step={{ index: 1, total }}
        onClose={onClose}
        primary={{ label: skipBank ? "Looks right, save" : "Looks right", disabled: detailsMissing, pending, onClick: () => { if (skipBank) void save(); else setStep("bank"); } }}
        secondary={{ label: "Back", onClick: () => setStep("drop") }}
      >
        <div className="space-y-3">
          {row("legalName", "Legal name", { hint: "As on your PAN and GST registration." })}
          {row("address", "Registered address", { multiline: true })}
          {row("gstin", "GSTIN", { upper: true, maxLength: 15, hint: "15 characters" })}
          {row("pan", "PAN", {
            upper: true, maxLength: 10, hint: "Like ABCDE1234F. Filled in from your GSTIN if empty.",
            note: mismatch ? <p id="pan-mismatch" className="text-xs text-flag">Doesn't match the PAN inside your GSTIN ({mismatch}).</p> : null,
          })}
          {showIec || fe.iec
            ? row("iec", "IEC (optional)", { upper: true, maxLength: 10, hint: "10 characters, if you have one" })
            : <button type="button" onClick={() => setShowIec(true)} className="min-h-11 rounded-full px-2 text-sm font-bold text-accent hover:bg-accent-soft">Add IEC</button>}
          {skipBank && (
            <div className="flex items-center gap-3 rounded-xl bg-surface-soft px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-muted">Bank</p>
                <p className="font-medium">{bankName}</p>
              </div>
              <button type="button" onClick={() => setStep("bank")} className="min-h-11 rounded-full px-3 text-sm font-bold text-accent hover:bg-accent-soft">Change</button>
            </div>
          )}
          {generalError}
        </div>
      </FlowFrame>
    );
  }

  const bankError = fe.name ?? fe.defaultAdBankId;
  return (
    <FlowFrame
      title="Your bank"
      step={{ index: total - 1, total }}
      onClose={onClose}
      primary={{ label: "Save and continue", disabled: !bankName, pending, onClick: () => void save() }}
      secondary={{ label: "Back", onClick: () => setStep("you") }}
    >
      <p className="text-sm text-muted">Which bank receives your foreign payments? New invoices are filed with this bank unless you change it.</p>
      <div role="radiogroup" aria-label="Your bank" className="grid gap-2 sm:grid-cols-2">
        {[...BANK_CATALOG.map((b) => ({ key: b.key, name: b.name })), { key: OTHER_BANK_KEY, name: "Other bank" }].map((b) => (
          <button
            key={b.key}
            type="button"
            role="radio"
            aria-checked={bank.key === b.key}
            onClick={() => setBank((prev) => ({ ...prev, key: b.key }))}
            className={cx("min-h-14 rounded-xl border-2 px-4 py-3 text-left font-bold", bank.key === b.key ? "border-accent bg-accent-soft" : "border-line bg-surface hover:bg-surface-soft")}
          >
            {b.name}
          </button>
        ))}
      </div>
      {bank.key === OTHER_BANK_KEY && (
        <Field id="setup-bankName" label="Bank name" error={bankError}>
          <Input id="setup-bankName" value={bank.otherName} onChange={(e) => setBank((prev) => ({ ...prev, otherName: e.target.value }))} placeholder="e.g. Federal Bank" aria-invalid={!!bankError} autoFocus />
        </Field>
      )}
      {bank.key !== OTHER_BANK_KEY && bankError && <p role="alert" className="text-xs font-medium text-danger">{bankError}</p>}
      {generalError}
    </FlowFrame>
  );
}
