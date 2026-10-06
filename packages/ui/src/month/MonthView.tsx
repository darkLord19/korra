"use client";
import type { ReactNode } from "react";
import type { AdBankWire, MonthStateWire, PackWire } from "@korra/backend/schemas";
import { buttonClass, Card, CardBody, CardHeader } from "../components";
import { useNav } from "../context";
import { monthLabel, shiftMonth } from "../lib/format";
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
}

const DEFAULT_UPLOAD_DESCRIPTION = "Add this month's invoices, your Deel transactions export, FIRAs and NOCs. Files go straight to secure storage.";

/** One month's workspace. With `readOnly` the upload panel, editing, match buttons and generate buttons are gone. */
export function MonthView({ month, state, banks, packs, readOnly = false, onChanged, onPoll, uploadDescription = DEFAULT_UPLOAD_DESCRIPTION }: MonthViewProps) {
  const nav = useNav();
  const { Link } = nav;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{monthLabel(month)}</h1>
        <nav aria-label="Month" className="flex gap-2">
          <Link href={nav.hrefs.month(shiftMonth(month, -1))} className={buttonClass("secondary", "sm")} aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`}>Previous</Link>
          <Link href={nav.hrefs.month(shiftMonth(month, 1))} className={buttonClass("secondary", "sm")} aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`}>Next</Link>
        </nav>
      </div>

      {!readOnly && (
        <Card aria-labelledby="upload-h" id="upload">
          <CardHeader id="upload-h" title="Upload" description={uploadDescription} />
          <CardBody>
            <UploadPanel month={month} onUploaded={() => onChanged?.()} />
          </CardBody>
        </Card>
      )}

      <DocumentsSection month={month} documents={state.documents} banks={banks} readOnly={readOnly} onChanged={onChanged} onPoll={onPoll} />
      <InvoicesSection month={month} invoices={state.invoices} banks={banks} realisations={state.realisations} readOnly={readOnly} onChanged={onChanged} />
      <PaymentsSection month={month} payments={state.payments} documents={state.documents} banks={banks} readOnly={readOnly} onChanged={onChanged} />
      <MatchesSection allocations={state.allocations} invoices={state.invoices} payments={state.payments} readOnly={readOnly} onChanged={onChanged} />
      <PacksSection month={month} blockersByBank={state.blockersByBank} invoices={state.invoices} packs={packs} readOnly={readOnly} onChanged={onChanged} />
    </div>
  );
}
