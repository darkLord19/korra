"use client";
import type { PackDownloads } from "../api";
import { Badge } from "../components";
import { useApi, useNav } from "../context";
import { PackFlow } from "../flows/PackFlow";
import { dateLabel, monthLabel } from "../lib/format";
import { PackFiles, PackSummaryCard } from "./PackSummary";

export interface PackViewProps {
  downloads: PackDownloads;
  /** A CA's view: the summary and the files, with nothing to change. Otherwise the owner's guided steps, at full width. */
  readOnly?: boolean;
}

export function PackView({ downloads, readOnly = false }: PackViewProps) {
  const api = useApi();
  const nav = useNav();
  const { pack, files, summary, bank } = downloads;

  if (!readOnly) {
    const home = () => nav.push(nav.hrefs.home());
    return (
      <PackFlow
        key={pack.id}
        task={{ id: `submit:${pack.id}`, kind: "submit", title: "", detail: "", urgency: "fyi", icon: "📮", month: pack.month, packId: pack.id, adBankId: pack.adBankId }}
        initial={downloads}
        onDone={home}
        onClose={home}
      />
    );
  }

  const bankName = bank?.name ?? "your bank";
  return (
    <div className="mx-auto max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl">EDF pack for {monthLabel(pack.month)}</h1>
        <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
          <span>{bankName}</span>
          {pack.status === "submitted" && pack.submittedAt ? <Badge tone="ok">Submitted {dateLabel(pack.submittedAt.slice(0, 10))}</Badge> : <Badge>Not submitted yet</Badge>}
        </p>
      </div>
      {summary && <PackSummaryCard month={pack.month} bankName={bankName} invoiceCount={summary.invoiceCount} totals={summary.totals} />}
      <section aria-labelledby="pack-inside-h" className="space-y-3">
        <h2 id="pack-inside-h" className="text-lg">What's inside</h2>
        {api.capabilities.signedUrlsExpire && <p className="text-xs text-muted">Download links work for 10 minutes. Reload this page for fresh ones.</p>}
        <PackFiles files={files} />
      </section>
    </div>
  );
}
