"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { edfDueDate } from "@korra/core";
import type { AdBankWire, MonthStateWire, PackWire } from "@korra/backend/schemas";
import { Badge, buttonClass, Button, Sheet } from "../components";
import { useNav } from "../context";
import { monthNextStep, monthStage, STAGE_LABEL, STAGE_TONE } from "../home/stage";
import { dateLabel, monthLabel, shiftMonth } from "../lib/format";
import { DocumentsSection } from "./DocumentsSection";
import { InvoiceCard } from "./InvoiceCard";
import { InvoiceSheet } from "./InvoiceSheet";
import { ManualInvoiceForm } from "./ManualEntry";
import { MatchesSection } from "./MatchesSection";
import { MonthLinks } from "./MonthLinks";
import { PaymentsSection } from "./PaymentsSection";
import { UploadPanel } from "./UploadPanel";

export interface MonthViewProps {
  month: string;
  state: MonthStateWire;
  banks: AdBankWire[];
  packs: PackWire[];
  /** Read-only views (a CA's) have no add buttons, editing, match buttons or next-step button. */
  readOnly?: boolean;
  /** Called after anything was changed: re-fetch the month. */
  onChanged?: () => void;
  /** Called every few seconds while documents are being read. Defaults to `nav.refresh`. */
  onPoll?: () => void;
  /** Replaces the text above the file drop zone in "Add documents" (apps differ in where files go). */
  uploadDescription?: ReactNode;
}

const DEFAULT_UPLOAD_DESCRIPTION = "Add this month's invoices, your Deel transactions export, FIRAs and NOCs. Files go straight to secure storage.";

const arrow = "inline-flex size-11 items-center justify-center rounded-full border border-line text-lg font-bold hover:bg-accent-soft";
const summary = "flex min-h-11 cursor-pointer items-center rounded-2xl border border-line bg-surface px-5 py-3 font-bold marker:content-none [&::-webkit-details-marker]:hidden";

/** The invoice the URL hash points at: `#inv-<invoiceId>` or `#inv-<invoiceId>-<field>`. */
function invoiceFromHash(hash: string, state: MonthStateWire): string | null {
  const h = hash.replace(/^#/, "");
  return state.invoices.find((i) => h === `inv-${i.id}` || h.startsWith(`inv-${i.id}-`))?.id ?? null;
}

/** One month's workspace: its stage and next step, invoice cards (each opens a sheet), documents, payments and packs. */
export function MonthView({ month, state, banks, packs, readOnly = false, onChanged, onPoll, uploadDescription }: MonthViewProps) {
  const nav = useNav();
  const { Link } = nav;
  const [openId, setOpenId] = useState<string | null>(null);
  const [panel, setPanel] = useState<"documents" | "manual" | null>(null);
  const hashHandled = useRef(false);

  // `#inv-<id>` opens that invoice's sheet: on mount (the state may arrive a moment later) and when the hash changes.
  useEffect(() => {
    if (hashHandled.current) return;
    const id = invoiceFromHash(window.location.hash, state);
    if (id) { hashHandled.current = true; setOpenId(id); }
  }, [state]);
  useEffect(() => {
    const onHash = () => { const id = invoiceFromHash(window.location.hash, state); if (id) setOpenId(id); };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, [state]);

  const elsewhere = [...new Set(state.documents.flatMap((d) => d.invoiceMonths))].filter((m) => m !== month).sort();
  const stage = monthStage(state, packs);
  const next = readOnly ? null : monthNextStep(month, state, packs);
  const prev = shiftMonth(month, -1);
  const following = shiftMonth(month, 1);
  const openInvoice = openId ? state.invoices.find((i) => i.id === openId) ?? null : null;
  const bankName = (id: string) => banks.find((b) => b.id === id)?.name ?? "Your bank";

  return (
    <div className="space-y-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="min-w-0 text-3xl">{monthLabel(month)}</h1>
          <nav aria-label="Month" className="flex gap-2">
            <Link href={nav.hrefs.month(prev)} className={arrow} aria-label={`Previous month, ${monthLabel(prev)}`}><span aria-hidden="true">‹</span></Link>
            <Link href={nav.hrefs.month(following)} className={arrow} aria-label={`Next month, ${monthLabel(following)}`}><span aria-hidden="true">›</span></Link>
          </nav>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Badge tone={STAGE_TONE[stage]}>{STAGE_LABEL[stage]}</Badge>
          <span className="text-sm text-muted">EDF due {dateLabel(edfDueDate(month))}</span>
        </div>
        {next && (
          <Link href={"task" in next.to ? nav.hrefs.task(next.to.task) : nav.hrefs.settings()} className={buttonClass("primary", "lg")}>{next.label}</Link>
        )}
      </header>

      <section aria-labelledby="invoices-h" id="invoices" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="invoices-h" className="text-xl">Invoices ({state.invoices.length})</h2>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setPanel("documents")}>Add documents</Button>
              <Button variant="secondary" size="sm" onClick={() => setPanel("manual")}>Add an invoice by hand</Button>
            </div>
          )}
        </div>
        {state.invoices.length === 0 ? (
          <p className="rounded-2xl bg-surface-soft p-5 text-sm text-muted">
            {elsewhere.length > 0
              ? <>No invoices dated in this month. Invoices from this month&rsquo;s uploads are dated in <MonthLinks months={elsewhere} />.</>
              : readOnly ? "No invoices for this month." : "No invoices for this month yet."}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {state.invoices.map((inv) => (
              <li key={inv.id}><InvoiceCard invoice={inv} realisation={state.realisations[inv.id]} onOpen={() => setOpenId(inv.id)} /></li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="packs-h" id="packs" className="space-y-3">
        <h2 id="packs-h" className="text-xl">Packs</h2>
        {packs.length === 0 ? (
          <p className="text-sm text-muted">No pack for this month yet.</p>
        ) : (
          <ul className="space-y-2">
            {packs.map((p) => (
              <li key={p.id}>
                <Link href={nav.hrefs.pack(p.id)} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 hover:bg-accent-soft">
                  <span className="min-w-0">
                    <span className="block font-bold">{bankName(p.adBankId)}</span>
                    <span className="block text-sm text-muted">Made {dateLabel(p.generatedAt.slice(0, 10))}</span>
                  </span>
                  {p.status === "submitted" ? <Badge tone="ok">Sent ✓</Badge> : <Badge tone="accent">Not sent</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <details>
        <summary className={summary}>Documents ({state.documents.length})</summary>
        <div className="mt-3">
          <DocumentsSection month={month} documents={state.documents} banks={banks} lastSacCode={state.lastSacCode} readOnly={readOnly} onChanged={onChanged} onPoll={onPoll} />
        </div>
      </details>

      <details>
        <summary className={summary}>Payments &amp; matches</summary>
        <div className="mt-3 space-y-6">
          <PaymentsSection month={month} payments={state.payments} documents={state.documents} banks={banks} readOnly={readOnly} onChanged={onChanged} />
          <MatchesSection allocations={state.allocations} invoices={state.invoices} payments={state.payments} readOnly={readOnly} onChanged={onChanged} />
        </div>
      </details>

      <InvoiceSheet invoice={openInvoice} banks={banks} realisation={openInvoice ? state.realisations[openInvoice.id] : undefined} readOnly={readOnly} onClose={() => setOpenId(null)} onChanged={onChanged} />

      {!readOnly && (
        <>
          <Sheet open={panel === "documents"} onClose={() => setPanel(null)} title="Add documents">
            <div className="space-y-4">
              <p className="text-sm text-muted">{uploadDescription ?? DEFAULT_UPLOAD_DESCRIPTION}</p>
              <UploadPanel month={month} onUploaded={() => onChanged?.()} />
            </div>
          </Sheet>
          <Sheet open={panel === "manual"} onClose={() => setPanel(null)} title="Add an invoice by hand">
            <ManualInvoiceForm month={month} banks={banks} lastSacCode={state.lastSacCode} onCancel={() => setPanel(null)} onDone={() => { setPanel(null); onChanged?.(); }} />
          </Sheet>
        </>
      )}
    </div>
  );
}
