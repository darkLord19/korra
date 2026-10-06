import { getTracker } from "@korra/backend";
import { TrackerScreen } from "@korra/ui";
import { ownerCtx } from "@/server/ctx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tracker" };

export default async function TrackerPage() {
  return <TrackerScreen initial={await getTracker(await ownerCtx())} />;
}
