"use client";
import { useState } from "react";
import type { AdBankWire, SubmissionChannelWire } from "@korra/backend/schemas";
import { edfDueDate } from "@korra/core";
import type { PackDownloads } from "../api";
import { Alert, Badge, Button, Field, Input, buttonClass, cx } from "../components";
import { useApi, useNav } from "../context";
import { errorMessage } from "../errors";
import { dateLabel } from "../lib/format";
import { buildMailtoUrl, parseMailto } from "./mailto";
import { PackFiles } from "./PackSummary";

/** Every file, one after the other (browsers ask once to allow several downloads). */
function downloadAll(files: { name: string; url: string }[]) {
  files.forEach((f, i) => {
    setTimeout(() => {
      const a = document.createElement("a");
      a.href = f.url;
      a.download = f.name;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    }, i * 250);
  });
}

const CHANNEL_NAMES = { netbanking: "Netbanking", email: "Email", branch: "Branch" } as const;

/** The bank as `saveBank` takes it, with `patch` applied (so saving one field keeps the others). */
function bankInput(bank: AdBankWire, patch: { adCode?: string; contactEmail?: string }) {
  return {
    id: bank.id,
    name: bank.name,
    adCode: patch.adCode ?? bank.adCode,
    contactEmail: patch.contactEmail ?? bank.contactEmail ?? "",
    branch: bank.branch ?? undefined,
  };
}

function EmailBlock({ downloads, saveBank }: { downloads: PackDownloads; saveBank: (patch: { contactEmail: string }) => Promise<void> }) {
  const { Link, hrefs } = useNav();
  const { bank, pack, submission, summary, files } = downloads;
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (!bank) {
    return <p className="text-sm text-muted">Add your branch's email in <Link href={hrefs.settings()} className="text-accent underline">Settings</Link> to get an email draft.</p>;
  }

  async function save() {
    setPending(true);
    setError(null);
    try {
      await saveBank({ contactEmail: input.trim() });
      setEditing(false);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  if (!bank.contactEmail || editing) {
    return (
      <div className="space-y-3 rounded-2xl border border-line bg-surface-soft p-4">
        <p className="text-sm text-muted">Add your branch or Relationship Manager's email and we'll write the email for you.</p>
        <Field id="contactEmailInput" label="Branch or RM email" error={error ?? undefined}>
          <Input id="contactEmailInput" type="email" value={input} onChange={(e) => setInput(e.target.value)} placeholder="e.g. branch.trade@bank.com" />
        </Field>
        <div className="flex gap-2">
          <Button disabled={pending || !input.trim()} onClick={() => void save()}>{pending ? "Saving…" : "Save email"}</Button>
          {bank.contactEmail && <Button variant="secondary" onClick={() => setEditing(false)}>Cancel</Button>}
        </div>
      </div>
    );
  }

  const href = buildMailtoUrl({
    contactEmail: bank.contactEmail,
    ...(submission?.email?.subject ? { subject: submission.email.subject } : {}),
    ...(submission?.email?.intro ? { intro: submission.email.intro } : {}),
    packMonth: pack.month,
    bankName: bank.name,
    adCode: bank.adCode,
    ...(summary ? { summary } : {}),
    files,
  });
  const draft = parseMailto(href);
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-soft p-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <p className="min-w-0 break-all"><span className="text-muted">To: </span><span className="font-medium">{bank.contactEmail}</span></p>
        <button type="button" onClick={() => { setInput(bank.contactEmail ?? ""); setEditing(true); }} className="text-xs font-bold text-accent underline">Change email</button>
      </div>
      <div className="space-y-1">
        <p className="text-sm"><span className="text-muted">Subject: </span><span className="font-medium">{draft.subject}</span></p>
        <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-line bg-surface p-3 font-sans text-xs">{draft.body}</pre>
      </div>
      <a href={href} className={cx(buttonClass("primary", "md"), "w-full sm:w-auto")}>Open in email app</a>
      <p className="text-xs text-muted">Attach the downloaded files before sending; email links can't attach files.</p>
    </div>
  );
}

function ChannelCard({ channel, recommended, downloads, saveBank }: { channel: SubmissionChannelWire; recommended: boolean; downloads: PackDownloads; saveBank: (patch: { contactEmail: string }) => Promise<void> }) {
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base">{channel.title}</h3>
        <Badge tone={recommended ? "accent" : "neutral"}>{recommended ? "Recommended" : CHANNEL_NAMES[channel.kind]}</Badge>
      </div>
      {!channel.verified && <p className="text-sm font-medium text-flag">Confirm this with your branch.</p>}
      <ol className="list-inside list-decimal space-y-2 text-sm leading-relaxed">
        {channel.steps.map((st, i) => <li key={i}>{st}</li>)}
      </ol>
      {channel.links.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {channel.links.map((link) => (
            <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer" className="text-sm font-bold text-accent underline">{link.label} &rarr;</a>
          ))}
        </div>
      )}
      {channel.kind === "email" && <EmailBlock downloads={downloads} saveBank={saveBank} />}
    </div>
  );
}

function AdCodeBlock({ saveBank }: { saveBank: (patch: { adCode: string }) => Promise<void> }) {
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  async function save() {
    setPending(true);
    setError(null);
    try {
      await saveBank({ adCode: value.trim() });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
      <Field id="adCodeInput" label="AD code (optional)" hint="The code your bank gave you. Banks can also fill it in on the EDF." error={error ?? undefined}>
        <Input id="adCodeInput" value={value} onChange={(e) => setValue(e.target.value)} />
      </Field>
      <Button variant="secondary" disabled={pending || !value.trim()} onClick={() => void save()}>{pending ? "Saving…" : "Save AD code"}</Button>
    </div>
  );
}

/**
 * The Send step's body: download the pack, then the recommended way to send it (the first channel), the other ways
 * under a disclosure, and the optional AD code. `onBankSaved` receives the bank after an email or AD code was saved.
 */
export function SendPanel({ downloads, onBankSaved }: { downloads: PackDownloads; onBankSaved: (bank: AdBankWire) => void }) {
  const api = useApi();
  const { pack, placeholder, files, submission, bank } = downloads;
  const channels = submission?.channels ?? [];
  const bankName = bank?.name ?? "your bank";

  async function saveBank(patch: { adCode?: string; contactEmail?: string }) {
    if (!bank) return;
    onBankSaved(await api.saveBank(bankInput(bank, patch)));
  }

  return (
    <>
      {placeholder && (
        <Alert tone="warning">We couldn't find {bankName}'s own EDF form, so this uses the RBI format. Ask your branch if it's accepted.</Alert>
      )}

      <section aria-labelledby="send-download-h" className="space-y-3 rounded-2xl border border-line bg-surface p-5">
        <h2 id="send-download-h" className="text-lg">Download your pack</h2>
        <Button onClick={() => downloadAll(files)}>Download pack</Button>
        {api.capabilities.signedUrlsExpire && <p className="text-xs text-muted">Download links work for 10 minutes. Reload this page for fresh ones.</p>}
        <details className="text-sm">
          <summary className="min-h-11 cursor-pointer py-2 font-bold text-accent">What's inside</summary>
          <PackFiles files={files} />
        </details>
      </section>

      <section aria-labelledby="send-channel-h" className="space-y-3">
        <h2 id="send-channel-h" className="text-lg">Send it to {bankName} by {dateLabel(edfDueDate(pack.month))}</h2>
        {channels.length === 0 ? (
          <p className="text-sm text-muted">Check with your branch for submission instructions.</p>
        ) : (
          <>
            <ChannelCard channel={channels[0]!} recommended downloads={downloads} saveBank={saveBank} />
            {channels.length > 1 && (
              <details>
                <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-accent">Other ways to send</summary>
                <div className="space-y-3">
                  {channels.slice(1).map((ch, i) => <ChannelCard key={ch.kind + i} channel={ch} recommended={false} downloads={downloads} saveBank={saveBank} />)}
                </div>
              </details>
            )}
          </>
        )}
        {submission?.documents && submission.documents.length > 0 && (
          <details>
            <summary className="min-h-11 cursor-pointer py-2 text-sm font-bold text-accent">Documents your bank asks for</summary>
            <ul className="list-inside list-disc space-y-1 text-sm text-muted">
              {submission.documents.map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          </details>
        )}
      </section>

      {bank && !bank.adCode && <AdCodeBlock saveBank={saveBank} />}
    </>
  );
}
