import { getTracker } from "@korra/backend";
import { TrackerView } from "@/components/tracker/TrackerView";
import { caCtx } from "@/server/ctx";
import { notFoundOrThrow } from "@/server/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client tracker" };

export default async function ClientTrackerPage({ params }: { params: Promise<{ ownerId: string }> }) {
  const { ownerId } = await params;
  return <TrackerView tracker={await getTracker(await caCtx(ownerId)).catch(notFoundOrThrow)} base={`/ca/${ownerId}`} />;
}
