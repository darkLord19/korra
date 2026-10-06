import Link from "next/link";
import { redirect } from "next/navigation";
import { getOnboarding } from "@korra/backend";
import { Footer } from "@/components/Footer";
import { buttonClass } from "@/components/ui";
import { currentMonthIST } from "@/lib/format";
import { currentUser, ownerCtx } from "@/server/ctx";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (await currentUser()) {
    const ob = await getOnboarding(await ownerCtx());
    redirect(ob.complete ? `/months/${currentMonthIST()}` : "/onboarding");
  }
  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-3xl items-center justify-between px-4 py-5">
        <span className="font-serif text-xl font-semibold tracking-tight">Korra</span>
        <Link href="/sign-in" className="text-sm text-accent underline">Sign in</Link>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-10">
        <h1 className="max-w-2xl text-4xl leading-tight font-semibold sm:text-5xl">Your export declaration forms, ready for the bank.</h1>
        <p className="mt-5 max-w-xl text-lg text-muted">
          If you invoice foreign clients as a freelancer or agency in India, your AD bank needs an Export Declaration Form (EDF) for each month&rsquo;s invoices.
          Korra reads your invoices and payment statements, matches payments to invoices, and prepares the PDF, spreadsheet and supporting documents for your bank.
        </p>
        <div className="mt-8 rounded-lg border border-flag/40 bg-flag-soft p-5">
          <p className="font-medium">Deadline: 30 November 2026</p>
          <p className="mt-1 text-sm">EDFs for October 2026 invoices are due 30 days after month end. Later months follow the same rule.</p>
        </div>
        <ul className="mt-8 max-w-xl list-disc space-y-2 pl-5 text-sm">
          <li>Upload invoices (PDF, image or CSV) and your Deel transaction export, FIRA and NOC documents.</li>
          <li>Check what Korra extracted. Anything it is unsure about is marked for you to confirm.</li>
          <li>Download one EDF pack per bank, with a plain-language guide to submitting it.</li>
          <li>Track which invoices are realised, and when each one is due (9 months, or 12 for INR).</li>
        </ul>
        <p className="mt-6 max-w-xl text-sm text-muted">
          Deel is supported first. Other payment sources can be added with a generic CSV. The ICICI, HDFC and Axis layouts are placeholders until we have real bank formats; the generic layout is complete.
        </p>
        <div className="mt-8 flex gap-3">
          <Link href="/sign-up" className={buttonClass("primary")}>Create a free account</Link>
          <Link href="/sign-in" className={buttonClass("secondary")}>Sign in</Link>
        </div>
      </main>
      <Footer />
    </div>
  );
}
