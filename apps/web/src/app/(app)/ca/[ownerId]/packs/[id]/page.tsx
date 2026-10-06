import { getPackDownloads } from "@korra/backend";
import { PackView } from "@korra/ui";
import { caCtx } from "@/server/ctx";
import { packForBrowser } from "@/server/downloads";
import { notFoundOrThrow } from "@/server/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client EDF pack" };

export default async function ClientPackPage({ params }: { params: Promise<{ ownerId: string; id: string }> }) {
  const { ownerId, id } = await params;
  const downloads = await getPackDownloads(await caCtx(ownerId), id).catch(notFoundOrThrow);
  return <PackView downloads={await packForBrowser(downloads)} readOnly />;
}
