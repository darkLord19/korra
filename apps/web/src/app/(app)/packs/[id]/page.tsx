import { getPackDownloads } from "@korra/backend";
import { PackScreen } from "@korra/ui";
import { ownerCtx } from "@/server/ctx";
import { packForBrowser } from "@/server/downloads";
import { notFoundOrThrow } from "@/server/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "EDF pack" };

export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const downloads = await getPackDownloads(await ownerCtx(), id).catch(notFoundOrThrow);
  return <PackScreen key={id} packId={id} initial={await packForBrowser(downloads)} />;
}
