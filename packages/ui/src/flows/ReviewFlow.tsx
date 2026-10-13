"use client";
import { useRef, useState } from "react";
import type { InvoiceWire, MonthStateWire, OnboardingWire } from "@korra/backend/schemas";
import { Alert, Button, EmptyState, FileName, IconBubble, Skeleton } from "../components";
import { useApi } from "../context";
import { errorMessage } from "../errors";
import { INVOICE_FIELDS, type FieldData } from "../lib/fields";
import { FIELD_LABELS, midSentence } from "../lib/format";
import { FieldEditor, displayField } from "../month/FieldEditor";
import { useLoaded } from "../screens/useLoaded";
import { FlowFrame } from "./FlowFrame";
import type { FlowProps } from "./types";

interface QueueItem { key: string; invoiceId: string; field: string; missing: boolean; confidence: number }

/**
 * One item per flagged or missing invoice field, from `blockersByBank` (every bank repeats them, so de-duplicated by
 * invoice and field), ordered by invoice (as listed in the month) and then by field order.
 */
export function buildReviewQueue(state: MonthStateWire): QueueItem[] {
  const seen = new Map<string, QueueItem>();
  for (const bank of state.blockersByBank) {
    for (const b of bank.blockers) {
      if (b.kind === "flagged_field") seen.set(`${b.id}:${b.field}`, { key: `${b.id}:${b.field}`, invoiceId: b.id, field: b.field, missing: false, confidence: b.confidence });
      else if (b.kind === "missing_field" && b.entity === "invoice") seen.set(`${b.id}:${b.field}`, { key: `${b.id}:${b.field}`, invoiceId: b.id, field: b.field, missing: true, confidence: 0 });
    }
  }
  const invoiceRank = (id: string) => { const i = state.invoices.findIndex((x) => x.id === id); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  const fieldRank = (f: string) => { const i = INVOICE_FIELDS.findIndex((x) => x.name === f); return i < 0 ? Number.MAX_SAFE_INTEGER : i; };
  return [...seen.values()].sort((a, b) => invoiceRank(a.invoiceId) - invoiceRank(b.invoiceId) || fieldRank(a.field) - fieldRank(b.field));
}

/** Walks through what Korra was unsure about, one card at a time: "Looks right", "Fix it", or skip. */
export function ReviewFlow({ task, onDone, onClose }: FlowProps) {
  const api = useApi();
  const month = task.month ?? "";
  const { data: state, error, reload } = useLoaded<MonthStateWire>(() => api.getMonthState(month), undefined, `review:${month}`);
  const { data: ob, error: obError } = useLoaded<OnboardingWire>(() => api.getOnboarding(), undefined, "onboarding");
  const [moved, setMoved] = useState<string[]>([]); // skipped items, oldest first: they go to the end
  const [fixing, setFixing] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const seen = useRef(0); // the most items the queue has held: the dots' total

  if (!state || (!ob && !obError)) {
    return (
      <FlowFrame title="A few quick checks" onClose={onClose}>
        {error ? <Alert tone="danger">{error}</Alert> : <Skeleton className="h-48" />}
      </FlowFrame>
    );
  }

  const banks = ob?.banks ?? [];
  const base = buildReviewQueue(state);
  const queue = [...base.filter((i) => !moved.includes(i.key)), ...moved.flatMap((k) => base.filter((i) => i.key === k))];
  seen.current = Math.max(seen.current, queue.length);
  const current = queue[0];

  async function run(action: () => Promise<unknown>) {
    setPending(true);
    setActionError(null);
    try {
      await action();
      setFixing(null);
      await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  if (!current) {
    const bankId = state.blockersByBank.find((b) => b.blockers.length === 0)?.adBankId;
    return (
      <FlowFrame
        title="A few quick checks"
        onClose={onClose}
        primary={{ label: "Make my pack", onClick: () => (bankId ? onDone(`generate:${month}:${bankId}`) : onDone()) }}
      >
        <div className="animate-pop-in">
          <EmptyState icon="🎉" title="All checked ✓">Everything looks right. Your pack is ready to make.</EmptyState>
        </div>
      </FlowFrame>
    );
  }

  const inv: InvoiceWire | undefined = state.invoices.find((i) => i.id === current.invoiceId);
  const spec = INVOICE_FIELDS.find((f) => f.name === current.field);
  const label = FIELD_LABELS[current.field] ?? current.field;
  const invoiceNo = inv?.invoiceNo.value ?? "this invoice";
  // How the card's sentence names the invoice: by number, except for the number itself (it would repeat) and when it has none.
  const named = current.field === "invoiceNo" ? "this invoice" : invoiceNo;
  const data: FieldData = (inv?.[current.field as keyof InvoiceWire] as FieldData | undefined) ?? { value: null, confidence: 0, source: "default" };
  const kind = spec?.kind ?? "text";
  const shown = displayField(kind, data.value, banks);
  const confidence = current.missing ? data.confidence : current.confidence;
  const pct = Math.round(confidence * 100);
  const sameInvoice = queue.filter((i) => i.invoiceId === current.invoiceId).length;
  const sourceName = inv?.documentId ? state.documents.find((d) => d.id === inv.documentId)?.filename : undefined;
  const editing = current.missing || fixing === current.key;

  return (
    <FlowFrame
      title="A few quick checks"
      step={{ index: seen.current - queue.length, total: seen.current }}
      onClose={onClose}
      {...(editing ? {} : { primary: { label: "Looks right", pending, onClick: () => void run(() => api.editField({ entity: "invoice", id: current.invoiceId, field: current.field, value: data.value })) } })}
      {...(editing ? {} : { secondary: { label: "Fix it", onClick: () => setFixing(current.key) } })}
    >
      <div key={current.key} className="space-y-4 rounded-2xl border border-line bg-surface p-5 animate-pop-in">
        <IconBubble icon={current.missing ? "✏️" : "🔎"} tone="flag" />
        {current.missing ? (
          <p className="text-lg">{named === "this invoice" ? "This invoice" : named} is missing its {midSentence(label)}</p>
        ) : (
          <div className="space-y-1">
            <p className="text-lg">Korra read <strong>{shown}</strong> as the {midSentence(label)} on {named}</p>
            <p className="text-sm text-muted">{confidence < 0.5 ? `Not sure (${pct}%)` : `Fairly sure (${pct}%)`}</p>
          </div>
        )}
        {sourceName && <p className="flex min-w-0 gap-1 text-xs text-muted"><span>From</span><FileName name={sourceName} /></p>}
        {editing && (
          <FieldEditor
            entity="invoice" id={current.invoiceId} field={current.field} kind={kind} data={data} banks={banks} label={label}
            submitLabel="Save"
            onSaved={() => { setFixing(null); setActionError(null); void reload(); }}
            onCancel={current.missing ? undefined : () => setFixing(null)}
          />
        )}
      </div>
      {actionError && <Alert tone="danger">{actionError}</Alert>}
      <div className="flex flex-wrap items-center gap-2">
        {sameInvoice >= 2 && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => void run(() => api.confirmAllFields({ entity: "invoice", id: current.invoiceId }))}>
            Everything on {invoiceNo} looks right
          </Button>
        )}
        {queue.length > 1 && (
          <Button variant="ghost" size="sm" disabled={pending} onClick={() => { setFixing(null); setMoved((m) => [...m.filter((k) => k !== current.key), current.key]); }}>
            Skip
          </Button>
        )}
      </div>
    </FlowFrame>
  );
}
