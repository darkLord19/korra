import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getMonthState, getOnboarding, isPlaceholderLayout, layoutIdFor, listPacks, yearMonthSchema } from "@korra/backend";
import { buttonClass, Card, CardBody, CardHeader } from "@/components/ui";
import { DocumentsSection } from "@/components/month/DocumentsSection";
import { InvoicesSection } from "@/components/month/InvoicesSection";
import { MatchesSection } from "@/components/month/MatchesSection";
import { PacksSection } from "@/components/month/PacksSection";
import { PaymentsSection } from "@/components/month/PaymentsSection";
import { UploadPanel } from "@/components/month/UploadPanel";
import { monthLabel, shiftMonth } from "@/lib/format";
import { ownerCtx } from "@/server/ctx";
import {
  confirmUploadAction, decideAllocationAction, editFieldAction, generatePackAction, linkNocAction, requestUploadAction,
} from "./actions";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  return { title: yearMonthSchema.safeParse(month).success ? monthLabel(month) : "Month" };
}

export default async function MonthPage({ params }: { params: Promise<{ month: string }> }) {
  const { month } = await params;
  if (!yearMonthSchema.safeParse(month).success) notFound();
  const ctx = await ownerCtx();
  const onboarding = await getOnboarding(ctx);
  if (!onboarding.complete) redirect("/onboarding");
  const [state, packs] = await Promise.all([getMonthState(ctx, month), listPacks(ctx, month)]);
  const placeholderBankIds = state.blockersByBank
    .filter((b) => isPlaceholderLayout(layoutIdFor(b.adBankName)))
    .map((b) => b.adBankId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{monthLabel(month)}</h1>
        <nav aria-label="Month" className="flex gap-2">
          <Link href={`/months/${shiftMonth(month, -1)}`} className={buttonClass("secondary", "sm")} aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`}>Previous</Link>
          <Link href={`/months/${shiftMonth(month, 1)}`} className={buttonClass("secondary", "sm")} aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`}>Next</Link>
        </nav>
      </div>

      <Card aria-labelledby="upload-h" id="upload">
        <CardHeader id="upload-h" title="Upload" description="Add this month's invoices, your Deel transactions export, FIRAs and NOCs. Files go straight to secure storage." />
        <CardBody>
          <UploadPanel month={month} requestUploadAction={requestUploadAction} confirmUploadAction={confirmUploadAction} />
        </CardBody>
      </Card>

      <DocumentsSection documents={state.documents} />
      <InvoicesSection invoices={state.invoices} banks={onboarding.banks} realisations={state.realisations} save={editFieldAction.bind(null, month)} />
      <PaymentsSection payments={state.payments} documents={state.documents} banks={onboarding.banks} save={editFieldAction.bind(null, month)} link={linkNocAction.bind(null, month)} />
      <MatchesSection allocations={state.allocations} invoices={state.invoices} payments={state.payments} decide={decideAllocationAction.bind(null, month)} />
      <PacksSection month={month} blockersByBank={state.blockersByBank} invoices={state.invoices} packs={packs} placeholderBankIds={placeholderBankIds} generate={generatePackAction} />
    </div>
  );
}
