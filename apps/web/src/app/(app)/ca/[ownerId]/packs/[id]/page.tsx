import { getPackDownloads } from "@korra/backend";
import { PackView } from "@/components/PackView";
import { caCtx } from "@/server/ctx";
import { fetchText } from "@/server/downloads";
import { notFoundOrThrow } from "@/server/errors";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client EDF pack" };

export default async function ClientPackPage({ params }: { params: Promise<{ ownerId: string; id: string }> }) {
  const { ownerId, id } = await params;
  const downloads = await getPackDownloads(await caCtx(ownerId), id).catch(notFoundOrThrow);
  const guide = downloads.files.find((f) => f.name.startsWith("HOW-TO-SUBMIT"));
  const guideText = guide ? await fetchText(guide.url) : null;
  return <PackView downloads={downloads} guideText={guideText} readOnly base={`/ca/${ownerId}`} />;
}
