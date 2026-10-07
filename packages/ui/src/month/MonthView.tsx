"use client";
import type { ReactNode } from "react";
import { edfDueDate } from "@korra/core";
import type { AdBankWire, MonthStateWire, PackWire } from "@korra/backend/schemas";
import { buttonClass, Card, CardBody, CardHeader, Select } from "../components";
import { useNav } from "../context";
import { currentMonthIST, dateLabel, monthLabel, shiftMonth } from "../lib/format";
import { flaggedCount } from "../lib/fields";
import { DocumentsSection } from "./DocumentsSection";
import { InvoicesSection } from "./InvoicesSection";
import { MatchesSection } from "./MatchesSection";
import { PacksSection } from "./PacksSection";
import { PaymentsSection } from "./PaymentsSection";
import { UploadPanel } from "./UploadPanel";

export interface MonthViewProps {
  month: string;
  state: MonthStateWire;
  banks: AdBankWire[];
  packs: PackWire[];
  /** Read-only views (a CA's) have no upload panel, editing, match or generate buttons. */
  readOnly?: boolean;
  /** Called after anything was changed: re-fetch the month. */
  onChanged?: () => void;
  /** Called every few seconds while documents are being read. Defaults to `nav.refresh`. */
  onPoll?: () => void;
  /** Replaces the text under the Upload heading (apps differ in where files go). */
  uploadDescription?: ReactNode;
  /** Streamlined first-run EDF flow hides payments, matches, prev/next and the upload hint. */
  mode?: "full" | "edf";
  /** Progress shown above the header (the first-run flow passes a stepper). */
  step?: ReactNode;
}

const DEFAULT_UPLOAD_DESCRIPTION = "Add this month's invoices, your Deel transactions export, FIRAs and NOCs. Files go straight to secure storage.";
/** One line on where the month stands (EDF flow): counts of invoices, unread documents, flags and missing fields, then the due date. */
function EdfStatus({ month, state }: { month: string; state: MonthStateWire }) {
  const n = state.invoices.length;
  const reading = state.documents.filter((d) => d.status === "uploaded" || d.status === "ingesting").length;
  const toConfirm = state.invoices.reduce((sum, inv) => sum + flaggedCount(inv), 0);
  const missing = state.blockersByBank.reduce((sum, b) => sum + b.blockers.filter((bl) => bl.kind === "missing_field").length, 0);
  const ready = n > 0 && state.blockersByBank.length > 0 && state.blockersByBank.every((b) => b.blockers.length === 0);
  const parts = [
    ready ? <span key="ready" className="font-medium text-ok">Ready to generate your pack</span> : n === 0 ? "No invoices yet" : n === 1 ? "1 invoice" : `${n} invoices`,
    ...(!ready && reading > 0 ? [`${reading} being read`] : []),
    ...(!ready && toConfirm > 0 ? [`${toConfirm} to confirm`] : []),
    ...(!ready && missing > 0 ? [`${missing} missing`] : []),
    `EDF due ${dateLabel(edfDueDate(month))}`,
  ];
  return (
    <div className="space-y-1">
      <p className="text-sm text-muted">{parts.map((p, i) => <span key={i}>{i > 0 && " · "}{p}</span>)}</p>
      {n === 0 && <p className="text-sm">Upload this month&rsquo;s invoices below. Korra reads them in this browser and marks anything it is unsure about.</p>}
    </div>
  );
}

const EDF_UPLOAD_DESCRIPTION = "Add this month's invoices (PDF, or a Deel export CSV).";

/** One month's workspace. With `readOnly` the upload panel, editing, match buttons and generate buttons are gone. */
export function MonthView({
  month,
  state,
  banks,
  packs,
  readOnly = false,
  onChanged,
  onPoll,
  uploadDescription,
  mode = "full",
  step,
}: MonthViewProps) {
  const nav = useNav();
  const { Link } = nav;
  const isEdf = mode === "edf";

  const current = currentMonthIST();
  const recentMonths = [current, shiftMonth(current, -1), shiftMonth(current, -2)];
  const monthOptions = recentMonths.includes(month) ? recentMonths : [month, ...recentMonths];

  return (
    <div className="space-y-6">
      {step}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <h1 className="text-2xl font-semibold sm:text-3xl">
            {isEdf ? `Your ${monthLabel(month)} invoices` : monthLabel(month)}
          </h1>
          {isEdf && !readOnly && <EdfStatus month={month} state={state} />}
        </div>
        {isEdf ? (
          <div className="flex items-center gap-2 sm:pt-2">
            <label htmlFor="change-month" className="whitespace-nowrap text-xs font-medium text-muted">Change month</label>
            <Select
              id="change-month"
              aria-label="Change month"
              value={month}
              onChange={(e) => nav.push(nav.hrefs.month(e.target.value))}
              className="w-auto py-1 text-sm"
            >
              {monthOptions.map((m) => (
                <option key={m} value={m}>{monthLabel(m)}</option>
              ))}
            </Select>
          </div>
        ) : (
          <nav aria-label="Month" className="flex gap-2">
            <Link href={nav.hrefs.month(shiftMonth(month, -1))} className={buttonClass("secondary", "sm")} aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`}>Previous</Link>
            <Link href={nav.hrefs.month(shiftMonth(month, 1))} className={buttonClass("secondary", "sm")} aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`}>Next</Link>
          </nav>
        )}
      </div>

      {!readOnly && (
        <Card aria-labelledby="upload-h" id="upload">
          <CardHeader id="upload-h" title="Upload" description={uploadDescription ?? (isEdf ? EDF_UPLOAD_DESCRIPTION : DEFAULT_UPLOAD_DESCRIPTION)} />
          <CardBody>
            <UploadPanel month={month} onUploaded={() => onChanged?.()} showHint={!isEdf} />
          </CardBody>
        </Card>
      )}

      <DocumentsSection month={month} documents={state.documents} banks={banks} lastSacCode={state.lastSacCode} readOnly={readOnly} onChanged={onChanged} onPoll={onPoll} />
      <InvoicesSection month={month} invoices={state.invoices} banks={banks} realisations={state.realisations} lastSacCode={state.lastSacCode} readOnly={readOnly} onChanged={onChanged} />
      {!isEdf && <PaymentsSection month={month} payments={state.payments} documents={state.documents} banks={banks} readOnly={readOnly} onChanged={onChanged} />}
      {!isEdf && <MatchesSection allocations={state.allocations} invoices={state.invoices} payments={state.payments} readOnly={readOnly} onChanged={onChanged} />}
      <PacksSection month={month} blockersByBank={state.blockersByBank} invoices={state.invoices} packs={packs} readOnly={readOnly} onChanged={onChanged} mode={mode} />
    </div>
  );
}
