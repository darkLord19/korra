import Link from "next/link";
import { isPlaceholderLayout, layoutIdFor } from "@korra/backend";
import type { AdBankWire, BlockerWire, EditFieldInput, MonthStateWire, PackWire, RequestUploadInput, RequestUploadResult } from "@korra/backend/schemas";
import { buttonClass, Card, CardBody, CardHeader } from "@/components/ui";
import { monthLabel, shiftMonth } from "@/lib/format";
import { DocumentsSection } from "./DocumentsSection";
import { InvoicesSection } from "./InvoicesSection";
import { MatchesSection } from "./MatchesSection";
import { PacksSection } from "./PacksSection";
import { PaymentsSection } from "./PaymentsSection";
import { UploadPanel } from "./UploadPanel";

type Ok<T = object> = Promise<({ ok: true } & T) | { ok: false; error: string }>;

/** The server actions the owner's month page binds. Read-only views pass none. */
export interface MonthActions {
  requestUpload: (input: RequestUploadInput) => Ok<{ upload: RequestUploadResult }>;
  confirmUpload: (documentId: string) => Ok;
  save: (input: EditFieldInput) => Ok;
  link: (paymentId: string, documentId: string) => Ok;
  decide: (invoiceId: string, paymentId: string, decision: "confirm" | "reject") => Ok;
  generate: (month: string, adBankId: string) => Promise<{ blockers: BlockerWire[] } | { error: string }>;
}

type Props = {
  month: string;
  state: MonthStateWire;
  banks: AdBankWire[];
  packs: PackWire[];
  /** "" for the owner; `/ca/${ownerId}` for a CA's read-only view. Prefixes month and pack links. */
  base?: string;
} & ({ readOnly: true; actions?: undefined } | { readOnly?: false; actions: MonthActions });

/** One month's workspace. With `readOnly` the upload panel, editing, match buttons and generate buttons are gone. */
export function MonthView({ month, state, banks, packs, base = "", readOnly = false, actions }: Props) {
  const placeholderBankIds = state.blockersByBank.filter((b) => isPlaceholderLayout(layoutIdFor(b.adBankName))).map((b) => b.adBankId);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">{monthLabel(month)}</h1>
        <nav aria-label="Month" className="flex gap-2">
          <Link href={`${base}/months/${shiftMonth(month, -1)}`} className={buttonClass("secondary", "sm")} aria-label={`Previous month, ${monthLabel(shiftMonth(month, -1))}`}>Previous</Link>
          <Link href={`${base}/months/${shiftMonth(month, 1)}`} className={buttonClass("secondary", "sm")} aria-label={`Next month, ${monthLabel(shiftMonth(month, 1))}`}>Next</Link>
        </nav>
      </div>

      {!readOnly && actions && (
        <Card aria-labelledby="upload-h" id="upload">
          <CardHeader id="upload-h" title="Upload" description="Add this month's invoices, your Deel transactions export, FIRAs and NOCs. Files go straight to secure storage." />
          <CardBody>
            <UploadPanel month={month} requestUploadAction={actions.requestUpload} confirmUploadAction={actions.confirmUpload} />
          </CardBody>
        </Card>
      )}

      <DocumentsSection documents={state.documents} />
      <InvoicesSection invoices={state.invoices} banks={banks} realisations={state.realisations} readOnly={readOnly} save={actions?.save} />
      <PaymentsSection payments={state.payments} documents={state.documents} banks={banks} readOnly={readOnly} save={actions?.save} link={actions?.link} />
      <MatchesSection allocations={state.allocations} invoices={state.invoices} payments={state.payments} readOnly={readOnly} decide={actions?.decide} />
      <PacksSection month={month} blockersByBank={state.blockersByBank} invoices={state.invoices} packs={packs} placeholderBankIds={placeholderBankIds}
        readOnly={readOnly} generate={actions?.generate} packHref={(id) => `${base}/packs/${id}`} />
    </div>
  );
}
