import { notFound, redirect } from "next/navigation";
import { after } from "next/server";
import { getMonthState, getOnboarding, listPacks, requeueStuckIngests, runIngest, yearMonthSchema } from "@korra/backend";
import { MonthScreen, monthLabel } from "@korra/ui";
import { ownerCtx } from "@/server/ctx";
import { getDeps } from "@/server/deps";

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
  // Hobby crons run once a day, so retry this owner's stuck documents here (the daily sweep is the backstop).
  const stuck = await requeueStuckIngests(ctx);
  if (stuck.length > 0) {
    const deps = await getDeps();
    for (const id of stuck) after(() => runIngest(deps, id));
  }
  const [state, packs] = await Promise.all([getMonthState(ctx, month), listPacks(ctx, month)]);
  return <MonthScreen key={month} month={month} initial={{ state, banks: onboarding.banks, packs }} />;
}
