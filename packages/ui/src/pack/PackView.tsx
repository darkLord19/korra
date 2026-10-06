"use client";
import { useEffect, useState } from "react";
import type { PackDownloads } from "../api";
import { Alert, Badge, Card, CardBody, CardHeader, buttonClass } from "../components";
import { DISCLAIMER } from "../components/Footer";
import { Markdown } from "../components/Markdown";
import { useNav } from "../context";
import { dateLabel, monthLabel } from "../lib/format";
import { SubmitPanel } from "./SubmitPanel";

export interface PackViewProps {
  downloads: PackDownloads;
  /** Read-only views (a CA's) have no "after you submit" panel and different wording. */
  readOnly?: boolean;
  /** Called after the pack was marked submitted: re-fetch it. */
  onChanged?: () => void;
}

/** The guide's text: from the adapter when it has it, else read from the guide file's URL. */
function useGuideText(downloads: PackDownloads): string | null {
  const guide = downloads.files.find((f) => f.name.startsWith("HOW-TO-SUBMIT"));
  const given = downloads.guideText;
  const [fetched, setFetched] = useState<string | null>(null);
  const url = guide?.url;
  useEffect(() => {
    if (given !== undefined || !url) return;
    let live = true;
    fetch(url).then((r) => (r.ok ? r.text() : null)).catch(() => null).then((t) => { if (live) setFetched(t); });
    return () => { live = false; };
  }, [given, url]);
  return given !== undefined ? given : fetched;
}

export function PackView({ downloads, readOnly = false, onChanged }: PackViewProps) {
  const { pack, placeholder, files } = downloads;
  const nav = useNav();
  const { Link } = nav;
  const guideText = useGuideText(downloads);
  return (
    <div className="space-y-6">
      <div>
        <Link href={nav.hrefs.month(pack.month)} className="text-sm text-accent underline">Back to {monthLabel(pack.month)}</Link>
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
                <a href={f.url} download={f.name} className={buttonClass("secondary", "sm")}>Download</a>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card aria-labelledby="guide-h">
        <CardHeader id="guide-h" title="How to submit" />
        <CardBody>{guideText ? <Markdown source={guideText} /> : <p className="text-sm text-muted">The guide could not be loaded. It is also in the files above.</p>}</CardBody>
      </Card>

      {!readOnly && pack.status !== "submitted" && (
        <Card aria-labelledby="submit-h">
          <CardHeader id="submit-h" title="After you submit" description="Korra does not submit anything for you. Once you or your CA have filed this with the bank, record it here so reminders stop." />
          <CardBody>
            <SubmitPanel packId={pack.id} month={pack.month} onChanged={onChanged} />
          </CardBody>
        </Card>
      )}
      <p className="text-xs text-muted">{DISCLAIMER}</p>
    </div>
  );
}
