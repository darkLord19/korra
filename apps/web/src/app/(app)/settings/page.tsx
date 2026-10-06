import Link from "next/link";
import { getOnboarding, listMyCas } from "@korra/backend";
import { Card, CardBody, CardHeader, SettingsScreen } from "@korra/ui";
import { ownerCtx } from "@/server/ctx";
import { CaShareRow, DeleteAccountForm, InviteCaForm } from "./SettingsForms";

export const metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const ctx = await ownerCtx();
  const [ob, shares] = await Promise.all([getOnboarding(ctx), listMyCas(ctx)]);
  const visibleShares = shares.filter((s) => s.status !== "revoked");
  // The profile and bank forms are @korra/ui's. CA sharing and account deletion exist only in this app, so they are slots.
  return (
    <SettingsScreen
      initial={ob}
      slots={{
        caSharing: (
          <Card aria-labelledby="ca-h">
            <CardHeader id="ca-h" title="Share with my CA" description="Your CA can view and download your packs and your realisation tracker. They cannot change anything. You can remove access at any time." />
            <CardBody className="space-y-4">
              {visibleShares.length > 0 && <ul className="divide-y divide-line rounded-md border border-line text-sm" aria-label="People you have shared with">{visibleShares.map((s) => <CaShareRow key={s.id} share={s} />)}</ul>}
              <InviteCaForm />
              <p className="text-xs text-muted">Are you a CA with clients on Korra? <Link href="/ca" className="text-accent underline">See your clients</Link>.</p>
            </CardBody>
          </Card>
        ),
        data: (
          <Card aria-labelledby="data-h">
            <CardHeader id="data-h" title="Your data" description="Your database and uploaded files are stored in Mumbai (India), and the app runs there too. To read PDFs and images of invoices, FIRAs and NOCs, we send them to an AI provider (Anthropic) outside India. CSV files are read on our servers. We do not use your documents to train models. Every change to an extracted value is logged." />
            <CardBody className="space-y-3">
              <h3 className="font-medium text-danger">Delete account</h3>
              <p className="max-w-prose text-sm">This permanently and immediately removes your profile, banks, invoices, payments, packs and uploaded files from our database and file store, and stops all reminders. Backups kept by our hosting providers may persist for a limited period. It cannot be undone. Download any packs you need first.</p>
              <DeleteAccountForm />
            </CardBody>
          </Card>
        ),
      }}
    />
  );
}
