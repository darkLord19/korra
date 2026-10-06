import { notFound } from "next/navigation";
import { getMonthState, getOnboarding, listPacks, yearMonthSchema } from "@korra/backend";
import { MonthView } from "@korra/ui";
import { caCtx } from "@/server/ctx";
import { notFoundOrThrow } from "@/server/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client month" };

export default async function ClientMonthPage({ params }: { params: Promise<{ ownerId: string; month: string }> }) {
  const { ownerId, month } = await params;
  if (!yearMonthSchema.safeParse(month).success) notFound();
  const ctx = await caCtx(ownerId);
  const [onboarding, state, packs] = await Promise.all([getOnboarding(ctx), getMonthState(ctx, month), listPacks(ctx, month)]).catch(notFoundOrThrow);
  return <MonthView month={month} state={state} banks={onboarding.banks} packs={packs} readOnly />;
}
