import { getOnboarding } from "@korra/backend";
import { OnboardingScreen } from "@korra/ui";
import { ownerCtx } from "@/server/ctx";

export const metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  return <OnboardingScreen initial={await getOnboarding(await ownerCtx())} />;
}
