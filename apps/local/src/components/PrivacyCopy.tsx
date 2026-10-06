"use client";
// All privacy wording lives here: the first-run notice, the Settings summary and the /privacy page.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, Card, CardBody, CardHeader, DISCLAIMER } from "@korra/ui";
import { dismissPrivacyNotice, isPrivacyNoticeDismissed } from "@/lib/privacy-notice";
import { SafariAdvice } from "./SafetyBanners";

/** The one sentence everything else builds on. */
export const PRIVACY_LEAD = "Your documents and details are stored only in this browser. Korra has no server copy. Back up regularly.";

/**
 * WHAT KORRA SENDS OUT, in one place.
 *
 * Today: nothing but the app's own files is ever fetched, and there is no analytics. The anonymous usage counts
 * stage (V4, docs/design/v0-client-only-and-declarations.md section A9) REPLACES the body of this component with the
 * "Korra counts anonymous usage" paragraph and the opt-out; the privacy page and Settings both render it, so this
 * is the only place that has to change. Do not describe usage counts anywhere else before then.
 */
export function UsageStatement() {
  return (
    <p>
      Korra does not use analytics or tracking. Your browser downloads the app itself from Korra&apos;s web host, and that is the only
      thing it contacts: nothing about you or your documents is sent anywhere.
    </p>
  );
}

/** First run only: a short, dismissible notice above every screen. Not a dialog, so nothing waits on it. */
export function PrivacyNotice() {
  // Read storage in an effect, never while rendering: the server render and the first client render must match.
  const [visible, setVisible] = useState(false);
  useEffect(() => setVisible(!isPrivacyNoticeDismissed()), []);
  if (!visible) return null;
  return (
    <section aria-label="Privacy notice" className="mx-auto w-full max-w-5xl px-4 pt-6">
      <Alert tone="info" title="Your data stays on this device">
        <p>{PRIVACY_LEAD}</p>
        <p className="mt-1">{DISCLAIMER}</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button size="sm" onClick={() => { dismissPrivacyNotice(); setVisible(false); }}>Got it</Button>
          <Link href="/privacy" className="text-sm font-medium underline">How your data is handled</Link>
        </div>
      </Alert>
    </section>
  );
}

/** Settings slot: the short version, with a link to the full page. */
export function PrivacyPanel() {
  return (
    <Card aria-labelledby="privacy-h">
      <CardHeader id="privacy-h" title="Privacy" description={PRIVACY_LEAD} />
      <CardBody className="space-y-3 text-sm">
        <div className="space-y-2"><UsageStatement /></div>
        <p><Link href="/privacy" className="font-medium underline">Read how your data is handled</Link></p>
      </CardBody>
    </Card>
  );
}

const H2 = "mt-8 text-lg font-semibold";

/** `/privacy` */
export function PrivacyPage() {
  return (
    <article className="mx-auto max-w-2xl space-y-3 text-sm leading-relaxed">
      <h1 className="text-3xl font-semibold">Privacy</h1>
      <p className="text-base font-medium">{PRIVACY_LEAD}</p>

      <h2 className={H2}>What is stored, and where</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your exporter details, banks, invoices, payments, generated packs and the files you upload are stored in this browser, on this device. Korra cannot see them.</li>
        <li>PDFs and spreadsheets are read on your device. They are not uploaded anywhere.</li>
        <li>There are no accounts and no sign-in. Anyone who can use this browser profile can open your data.</li>
        <li>A few small settings, such as the date of your last backup, are kept in the same browser.</li>
      </ul>

      <h2 className={H2}>What leaves your device</h2>
      <UsageStatement />

      <h2 className={H2}>Back up and restore</h2>
      <p>
        &quot;Back up now&quot; in Settings saves everything in one <code>.korra</code> file. Keep it somewhere safe, ideally off this device. It holds your
        PAN, GSTIN and invoices, so treat it like those documents. Restoring a backup replaces everything in this browser with what is in the file.
        Korra reminds you when a backup is due.
      </p>

      <h2 className={H2}>Delete all local data</h2>
      <p>
        In Settings, under Your data, &quot;Delete all local data&quot; erases your details, invoices, packs and uploaded files from this browser and
        Korra starts from scratch. It cannot be undone. It does not touch backup files or packs you already downloaded: delete those yourself.
      </p>

      <h2 className={H2}>Your browser can clear this data</h2>
      <p>
        Browsers can clear a site&apos;s data when space runs low, or when you clear site data. Korra asks your browser to keep its data, and
        Settings shows whether it agreed, but that is a request, not a promise. That is why regular backups matter.
        <SafariAdvice />
      </p>

      <h2 className={H2}>Exports are copies</h2>
      <p>
        The calendar file holds invoice numbers and deadline dates only. &quot;Export for my CA&quot; makes a zip with your packs, a tracker spreadsheet
        (with client names and amounts) and the calendar. Both are copies made on your device on the day you download them. Nothing is shared or
        kept up to date for you, so make a new one when your data changes, and share them only with people you trust.
      </p>

      <p className="mt-8 border-t border-line pt-4 text-muted">{DISCLAIMER}</p>
    </article>
  );
}
