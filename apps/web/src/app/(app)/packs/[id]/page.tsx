import { getPackDownloads } from "@korra/backend";
import { PackView } from "@/components/PackView";
import { ownerCtx } from "@/server/ctx";
import { fetchText } from "@/server/downloads";
import { notFoundOrThrow } from "@/server/errors";
import { confirmUploadAction, requestUploadAction } from "../../months/[month]/actions";
import { markSubmittedAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "EDF pack" };

export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const downloads = await getPackDownloads(await ownerCtx(), id).catch(notFoundOrThrow);
  const guide = downloads.files.find((f) => f.name.startsWith("HOW-TO-SUBMIT"));
  const guideText = guide ? await fetchText(guide.url) : null;
  return (
    <PackView
      downloads={downloads} guideText={guideText}
      actions={{ requestUpload: requestUploadAction, confirmUpload: confirmUploadAction, markSubmitted: markSubmittedAction }}
    />
  );
}
