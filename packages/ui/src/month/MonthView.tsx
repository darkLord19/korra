"use client";
import type { ReactNode } from "react";
import type { AdBankWire, MonthStateWire, PackWire } from "@korra/backend/schemas";
import { buttonClass, Card, CardBody, CardHeader, Select } from "../components";
import { useNav } from "../context";
import { currentMonthIST, monthLabel, shiftMonth } from "../lib/format";
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
}

const DEFAULT_UPLOAD_DESCRIPTION = "Add this month's invoices, your Deel transactions export, FIRAs and NOCs. Files go straight to secure storage.";
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
}: MonthViewProps) {
  const nav = useNav();
  const { Link } = nav;
  const isEdf = mode === "edf";

  const current = currentMonthIST();
  const recentMonths = [current, shiftMonth(current, -1), shiftMonth(current, -2)];
  const monthOptions = recentMonths.includes(month) ? recentMonths : [month, ...recentMonths];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">
          {isEdf ? `Step 2 of 3 · Your ${monthLabel(month)} invoices` : monthLabel(month)}
        </h1>
        {isEdf ? (
          <div className="flex items-center gap-2">
            <label htmlFor="change-month" className="text-xs font-medium text-muted">Change month</label>
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

      <DocumentsSection month={month} documents={state.documents} banks={banks} readOnly={readOnly} onChanged={onChanged} onPoll={onPoll} />
      <InvoicesSection month={month} invoices={state.invoices} banks={banks} realisations={state.realisations} readOnly={readOnly} onChanged={onChanged} />
      {!isEdf && <PaymentsSection month={month} payments={state.payments} documents={state.documents} banks={banks} readOnly={readOnly} onChanged={onChanged} />}
      {!isEdf && <MatchesSection allocations={state.allocations} invoices={state.invoices} payments={state.payments} readOnly={readOnly} onChanged={onChanged} />}
      <PacksSection month={month} blockersByBank={state.blockersByBank} invoices={state.invoices} packs={packs} readOnly={readOnly} onChanged={onChanged} mode={mode} />
    </div>
  );
}
