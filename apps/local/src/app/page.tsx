import Link from "next/link";
import { Footer, IconBubble } from "@korra/ui";
import { LandingCta } from "@/components/LandingCta";

const STEPS = [
  { icon: "📤", title: "Drop an invoice", text: "PDFs, images or a Deel export CSV." },
  { icon: "✏️", title: "Confirm what Korra read", text: "Anything it is unsure about is marked for you." },
  { icon: "📮", title: "Send your pack", text: "The EDF and covering letter, ready for your bank." },
];

export default function Landing() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-4">
        <span className="text-xl font-extrabold tracking-tight">Korra</span>
        <Link href="/home" className="inline-flex min-h-11 items-center rounded-full px-4 text-sm font-bold text-accent hover:bg-accent-soft">Open app</Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 space-y-8 px-4 pb-10">
        <section className="hero-gradient rounded-3xl p-6 text-white shadow-lg sm:p-10">
          <h1 className="text-4xl leading-tight text-white sm:text-5xl">Your export declaration forms, ready for the bank.</h1>
          <p className="mt-4 max-w-xl text-base text-white sm:text-lg">
            If you invoice foreign clients from India, your AD bank needs an Export Declaration Form (EDF) for each month&rsquo;s invoices.
            Korra reads your invoices and payment statements, matches payments to invoices, and prepares the pack for your bank.
          </p>
          <div className="mt-6"><LandingCta /></div>
          <p className="mt-4 text-sm font-bold text-white">Your PAN and invoices never leave your device.</p>
        </section>

        <section aria-labelledby="how-h" className="space-y-3">
          <h2 id="how-h" className="text-2xl">How it works</h2>
          <ol className="space-y-3">
            {STEPS.map((s) => (
              <li key={s.title} className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-4">
                <IconBubble icon={s.icon} />
                <div>
                  <p className="font-extrabold">{s.title}</p>
                  <p className="text-sm text-muted">{s.text}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-2xl border border-flag/40 bg-flag-soft p-5">
          <p className="font-extrabold text-flag">Deadline: 30 November 2026</p>
          <p className="mt-1 text-sm">EDFs for October 2026 invoices are due 30 days after month end. Later months follow the same rule.</p>
        </section>

        <p className="text-sm text-muted">
          Deel is supported first, other sources via a generic CSV. HDFC and the generic layout are complete; ICICI and Axis are placeholders until we have real bank formats.
        </p>
      </main>
      <div className="mx-auto w-full max-w-3xl px-4 pb-4 text-xs text-muted">
        Your documents and details are stored only in this browser. Korra has no server copy.{" "}
        <Link href="/privacy" className="underline">Privacy</Link>
      </div>
      <div className="mx-auto w-full max-w-3xl"><Footer /></div>
    </div>
  );
}
