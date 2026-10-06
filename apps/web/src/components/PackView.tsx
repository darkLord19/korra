import Link from "next/link";
import type { PackDownloadsWire, RequestUploadInput, RequestUploadResult } from "@korra/backend/schemas";
import { DISCLAIMER } from "@/components/Footer";
import { Markdown } from "@/components/Markdown";
import { SubmitPanel } from "@/components/SubmitPanel";
import { Alert, Badge, Card, CardBody, CardHeader, buttonClass } from "@/components/ui";
import { dateLabel, monthLabel } from "@/lib/format";
import { browserUrl } from "@/server/downloads";

type Ok<T = object> = Promise<({ ok: true } & T) | { ok: false; error: string }>;

/** Actions the owner's pack page binds. Read-only views pass none. */
export interface PackActions {
  requestUpload: (input: RequestUploadInput) => Ok<{ upload: RequestUploadResult }>;
  confirmUpload: (documentId: string) => Ok;
  markSubmitted: (packId: string, ackDocumentId?: string) => Ok;
}

type Props = {
  downloads: PackDownloadsWire;
  guideText: string | null;
  /** "" for the owner; `/ca/${ownerId}` for a CA's read-only view. */
  base?: string;
} & ({ readOnly: true; actions?: undefined } | { readOnly?: false; actions: PackActions });

export function PackView({ downloads: { pack, placeholder, files }, guideText, base = "", readOnly = false, actions }: Props) {
  return (
    <div className="space-y-6">
      <div>
        <Link href={`${base}/months/${pack.month}`} className="text-sm text-accent underline">Back to {monthLabel(pack.month)}</Link>
        <h1 className="mt-2 text-3xl font-semibold">EDF pack for {monthLabel(pack.month)}</h1>
        <p className="mt-1 text-sm text-muted">Generated {dateLabel(pack.generatedAt.slice(0, 10))}. {pack.status === "submitted" && pack.submittedAt ? <Badge tone="ok">Submitted {dateLabel(pack.submittedAt.slice(0, 10))}</Badge> : <Badge>Not submitted yet</Badge>}</p>
      </div>

      {placeholder && (
        <Alert tone="warning" title="Placeholder layout">
          We do not have this bank&rsquo;s official EDF format yet, so the spreadsheet and PDF use a stand-in layout. Check them against {readOnly ? "the" : "your"} bank&rsquo;s form, or ask {readOnly ? "the" : "your"} bank whether it accepts this layout, before submitting.
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

      {!readOnly && actions && pack.status !== "submitted" && (
        <Card aria-labelledby="submit-h">
          <CardHeader id="submit-h" title="After you submit" description="Korra does not submit anything for you. Once you or your CA have filed this with the bank, record it here so reminders stop." />
          <CardBody>
            <SubmitPanel packId={pack.id} month={pack.month} requestUploadAction={actions.requestUpload} confirmUploadAction={actions.confirmUpload} markSubmitted={actions.markSubmitted} />
          </CardBody>
        </Card>
      )}
      <p className="text-xs text-muted">{DISCLAIMER}</p>
    </div>
  );
}
