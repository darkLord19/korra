import { getTracker } from "@korra/backend";
import { TrackerScreen } from "@korra/ui";
import { ownerCtx } from "@/server/ctx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Months" };

/** A stand-in until the months index exists: the tracker. */
export default async function MonthsPage() {
  return <TrackerScreen initial={await getTracker(await ownerCtx())} />;
}
