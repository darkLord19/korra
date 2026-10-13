import { redirect } from "next/navigation";
import { getOnboarding } from "@korra/backend";
import { currentMonthIST } from "@korra/ui";
import { ownerCtx } from "@/server/ctx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Home" };

/** A stand-in until Home exists: the current month, or setup first. */
export default async function HomePage() {
  const ob = await getOnboarding(await ownerCtx());
  redirect(ob.complete ? `/months/${currentMonthIST()}` : "/onboarding");
}
