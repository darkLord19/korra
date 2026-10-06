import Link from "next/link";
import { getPackDownloads } from "@korra/backend";
import { Markdown } from "@/components/Markdown";
import { DISCLAIMER } from "@/components/Footer";
import { SubmitPanel } from "@/components/SubmitPanel";
import { Alert, Badge, Card, CardBody, CardHeader, buttonClass } from "@/components/ui";
import { dateLabel, monthLabel } from "@/lib/format";
import { ownerCtx } from "@/server/ctx";
import { browserUrl, fetchText } from "@/server/downloads";
import { confirmUploadAction, requestUploadAction } from "../../months/[month]/actions";
import { markSubmittedAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "EDF pack" };

export default async function PackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { pack, placeholder, files } = await getPackDownloads(await ownerCtx(), id);
  const guide = files.find((f) => f.name.startsWith("HOW-TO-SUBMIT"));
  const guideText = guide ? await fetchText(guide.url) : null;
  return (
    <div className="space-y-6">
      <div>
        <Link href={`/months/${pack.month}`} className="text-sm text-accent underline">Back to {monthLabel(pack.month)}</Link>
        <h1 className="mt-2 text-3xl font-semibold">EDF pack for {monthLabel(pack.month)}</h1>
        <p className="mt-1 text-sm text-muted">Generated {dateLabel(pack.generatedAt.slice(0, 10))}. {pack.status === "submitted" && pack.submittedAt ? <Badge tone="ok">Submitted {dateLabel(pack.submittedAt.slice(0, 10))}</Badge> : <Badge>Not submitted yet</Badge>}</p>
      </div>

      {placeholder && (
        <Alert tone="warning" title="Placeholder layout">
          We do not have this bank&rsquo;s official EDF format yet, so the spreadsheet and PDF use a stand-in layout. Check them against your bank&rsquo;s form, or ask your bank whether it accepts this layout, before you submit.
        </Alert>
      )}

      <Card aria-labelledby="files-h">
        <CardHeader id="files-h" title="Files" description="Download links work for 10 minutes. Reload this page for fresh ones." />
        <CardBody className="px-0 py-0">
          <ul className="divide-y divide-line">
            {files.map((f) => (
              <li key={f.name} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                <span className="min-w-0 truncate">{f.name}</span>
                <a href={browserUrl(f.url)} download={f.name} className={buttonClass("secondary", "sm")}>Download</a>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card aria-labelledby="guide-h">
        <CardHeader id="guide-h" title="How to submit" />
        <CardBody>{guideText ? <Markdown source={guideText} /> : <p className="text-sm text-muted">The guide could not be loaded. It is also in the files above.</p>}</CardBody>
      </Card>

      {pack.status !== "submitted" && (
        <Card aria-labelledby="submit-h">
          <CardHeader id="submit-h" title="After you submit" description="Korra does not submit anything for you. Once you or your CA have filed this with the bank, record it here so reminders stop." />
          <CardBody>
            <SubmitPanel packId={pack.id} month={pack.month} requestUploadAction={requestUploadAction} confirmUploadAction={confirmUploadAction} markSubmitted={markSubmittedAction} />
          </CardBody>
        </Card>
      )}
      <p className="text-xs text-muted">{DISCLAIMER}</p>
    </div>
  );
}
