import Link from "next/link";
import { Footer } from "@korra/ui";
import { LandingCta, LandingSkipLink } from "@/components/LandingCta";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5">
        <span className="font-serif text-xl font-semibold tracking-tight">Korra</span>
        <LandingSkipLink />
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="max-w-2xl text-4xl leading-tight font-semibold sm:text-5xl">
          Your export declaration forms, ready for the bank.
        </h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          If you invoice foreign clients as a freelancer or agency in India, your AD bank needs an Export Declaration Form (EDF) for each month&rsquo;s invoices.
          Korra reads your invoices and payment statements, matches payments to invoices, and prepares the PDF, spreadsheet and supporting documents for your bank.
        </p>

        <div className="mt-8 rounded-lg border border-flag/40 bg-flag-soft p-5">
          <p className="font-medium">Deadline: 30 November 2026</p>
          <p className="mt-1 text-sm">
            EDFs for October 2026 invoices are due 30 days after month end. Later months follow the same rule.
          </p>
        </div>

        <div className="mt-8 space-y-3">
          <h2 className="text-lg font-semibold">How it works</h2>
          <ol className="max-w-xl list-decimal space-y-2 pl-5 text-sm">
            <li><strong>Set up:</strong> Choose your bank and add your exporter details once.</li>
            <li><strong>Upload invoices:</strong> Drop in PDFs or a Deel export CSV. Korra checks them and flags anything to confirm.</li>
            <li><strong>Download your EDF pack:</strong> Get the ready-to-submit pack and covering letter for your bank.</li>
          </ol>
        </div>

        <p className="mt-6 max-w-xl text-sm font-medium text-ink">
          Your PAN and invoices never leave your device.
        </p>

        <p className="mt-3 max-w-xl text-sm text-muted">
          Deel is supported first. Other payment sources can be added with a generic CSV. The HDFC layout follows HDFC Bank&rsquo;s published request letter, and the generic layout is complete. The ICICI and Axis layouts are placeholders until we have real bank formats.
        </p>

        <LandingCta />
      </main>
      <div className="mx-auto w-full max-w-3xl px-4 text-xs text-muted">
        Your documents and details are stored only in this browser. Korra has no server copy.{" "}
        <Link href="/privacy" className="underline">Privacy</Link>
      </div>
      <Footer />
    </div>
  );
}
