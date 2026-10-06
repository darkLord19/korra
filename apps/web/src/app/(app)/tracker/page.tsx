import { getTracker } from "@korra/backend";
import { TrackerView } from "@/components/tracker/TrackerView";
import { ownerCtx } from "@/server/ctx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tracker" };

export default async function TrackerPage() {
  return <TrackerView tracker={await getTracker(await ownerCtx())} />;
}
