import { getTracker } from "@korra/backend";
import { TrackerView } from "@korra/ui";
import { caCtx } from "@/server/ctx";
import { notFoundOrThrow } from "@/server/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client months" };

export default async function ClientMonthsPage({ params }: { params: Promise<{ ownerId: string }> }) {
  const { ownerId } = await params;
  return <TrackerView tracker={await getTracker(await caCtx(ownerId)).catch(notFoundOrThrow)} readOnly heading="h1" />;
}
