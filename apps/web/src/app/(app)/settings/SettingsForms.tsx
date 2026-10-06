"use client";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AdBankWire, CaShareWire } from "@korra/backend/schemas";
import { Alert, Badge, Button, Field, Input } from "@/components/ui";
import { authClient } from "@/lib/auth-client";
import type { FormState } from "@/lib/form-state";
import { dateLabel } from "@/lib/format";
import { deleteAccountAction, inviteCaAction, revokeCaAction, updateBankAction } from "./actions";

const empty: FormState = {};

export function BankRow({ bank, isDefault }: { bank: AdBankWire; isDefault: boolean }) {
  const [editing, setEditing] = useState(false);
  const [state, action, pending] = useActionState(updateBankAction, empty);
  useEffect(() => { if (state.ok) setEditing(false); }, [state]);
  const fe = state.fieldErrors ?? {};
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
      <form action={action} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-start">
        <input type="hidden" name="id" value={bank.id} />
        <Field id={`bn-${bank.id}`} label="Bank name" error={fe.name}><Input id={`bn-${bank.id}`} name="name" defaultValue={bank.name} required autoFocus /></Field>
        <Field id={`ba-${bank.id}`} label="AD code" error={fe.adCode}><Input id={`ba-${bank.id}`} name="adCode" defaultValue={bank.adCode} required /></Field>
        <div className="flex gap-2 sm:pt-[1.65rem]">
          <Button type="submit" size="sm" disabled={pending}>{pending ? "Saving..." : "Save"}</Button>
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={pending}>Cancel</Button>
        </div>
        {state.error && !state.fieldErrors && <div className="sm:col-span-3"><Alert tone="danger">{state.error}</Alert></div>}
      </form>
    </li>
  );
}

export function InviteCaForm() {
  const [state, action, pending] = useActionState(inviteCaAction, empty);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.ok) ref.current?.reset(); }, [state]);
  return (
    <form ref={ref} action={action} className="space-y-3">
      <Field id="ca-email" label="Your CA's email" hint="They get an email with a link to accept. They must sign in to Korra with this address." error={state.error}>
        <Input id="ca-email" name="email" type="email" required autoComplete="off" aria-invalid={!!state.error} defaultValue={state.values?.email ?? ""} />
      </Field>
      {state.ok && <Alert tone="success">Invitation sent.</Alert>}
      <Button type="submit" variant="secondary" disabled={pending}>{pending ? "Sending..." : "Send invitation"}</Button>
    </form>
  );
}

const SHARE_STATUS: Record<CaShareWire["status"], { label: string; tone: "ok" | "neutral" | "danger" }> = {
  accepted: { label: "Can view your records", tone: "ok" },
  invited: { label: "Invited, not accepted yet", tone: "neutral" },
  revoked: { label: "Access removed", tone: "danger" },
};

export function CaShareRow({ share }: { share: CaShareWire }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const s = SHARE_STATUS[share.status];
  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="min-w-0">
          <span className="block truncate">{share.caEmail}</span>
          <span className="text-xs text-muted">Invited {dateLabel(share.createdAt.slice(0, 10))}</span>
        </span>
        <span className="flex items-center gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
          {share.status !== "revoked" && (
            <Button size="sm" variant="secondary" disabled={pending} aria-label={`Revoke access for ${share.caEmail}`}
              onClick={() => { setError(null); start(async () => { const r = await revokeCaAction(share.id); if (!r.ok) setError(r.error); }); }}>
              {pending ? "Revoking..." : "Revoke"}
            </Button>
          )}
        </span>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </li>
  );
}

const PHRASE = "delete my account";

export function DeleteAccountForm() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const ready = text.trim().toLowerCase() === PHRASE;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        setError(null);
        start(async () => {
          const r = await deleteAccountAction();
          if (!r.ok) { setError(r.error); return; }
          try { await authClient.signOut(); } catch { /* the session is already gone with the account */ }
          router.replace("/?deleted=1");
          router.refresh();
        });
      }}
    >
      <Field id="delete-confirm" label={`Type "${PHRASE}" to confirm`}>
        <Input id="delete-confirm" value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" />
      </Field>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button type="submit" variant="danger" disabled={!ready || pending}>{pending ? "Deleting..." : "Delete my account"}</Button>
    </form>
  );
}
