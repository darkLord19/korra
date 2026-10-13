"use client";
import { useState } from "react";
import type { MonthStateWire, OnboardingWire } from "@korra/backend/schemas";
import { Alert, Badge, Sheet } from "../components";
import { useApi } from "../context";
import { monthLabel } from "../lib/format";
import { usePoll } from "../lib/use-poll";
import { DropZone, type DropItem } from "../month/DropZone";
import { ManualInvoiceForm } from "../month/ManualEntry";
import { useLoaded } from "../screens/useLoaded";
import { FlowFrame } from "./FlowFrame";
import type { FlowProps } from "./types";

const POLL_MS = 2000;
const isReading = (d: { status: string }) => d.status === "uploaded" || d.status === "ingesting";

/** True when the month still needs a person's eyes (a flagged field, or an invoice field that is missing). */
export function needsReview(state: MonthStateWire): boolean {
  return state.blockersByBank.some((b) => b.blockers.some((x) => x.kind === "flagged_field" || (x.kind === "missing_field" && x.entity === "invoice")));
}

/** Drop invoices or a Deel CSV, watch them being read, then Continue to review (if anything needs a look) or to making the pack. */
export function UploadFlow({ task, onDone, onClose }: FlowProps) {
  const api = useApi();
  const month = task.month ?? "";
  const { data: state, error, reload } = useLoaded<MonthStateWire>(() => api.getMonthState(month), undefined, `upload:${month}`);
  const { data: ob, error: obError } = useLoaded<OnboardingWire>(() => api.getOnboarding(), undefined, "onboarding");
  const [uploading, setUploading] = useState(false);
  const [manual, setManual] = useState(false);

  const reading = !!state?.documents.some(isReading);
  usePoll(reading, () => void reload(), POLL_MS);

  const banks = ob?.banks ?? [];

  function renderDone(item: DropItem) {
    const doc = state?.documents.find((d) => d.id === item.ref);
    if (doc?.status === "failed") return <Badge tone="danger">Failed</Badge>;
    if (doc && !isReading(doc)) return <Badge tone="ok">Read ✓</Badge>;
    return <Badge tone="accent">Reading…</Badge>;
  }

  function next() {
    if (!state) return;
    if (needsReview(state)) return onDone(`review:${month}`);
    const bankId = banks[0]?.id;
    if (state.invoices.length > 0 && bankId) return onDone(`generate:${month}:${bankId}`);
    onDone();
  }

  return (
    <FlowFrame
      title={`Add your ${monthLabel(month).split(" ")[0]} invoices`}
      onClose={onClose}
      primary={{ label: "Continue", disabled: !state || (!ob && !obError) || uploading || reading, onClick: next }}
      secondary={{ label: "Add an invoice by hand", onClick: () => setManual(true) }}
    >
      {error && !state && <Alert tone="danger">{error}</Alert>}
      <DropZone
        big
        title="Drop invoices or a Deel CSV"
        buttonLabel="Choose files"
        upload={async (file) => {
          const { documentId } = await api.uploadFile(file, { month });
          void reload();
          return documentId;
        }}
        renderDone={renderDone}
        onItems={(items) => setUploading(items.some((i) => i.state === "uploading"))}
      />
      {reading && <p role="status" className="text-sm text-muted">Korra is reading your files. This takes a moment.</p>}
      <Sheet open={manual} onClose={() => setManual(false)} title="Add an invoice by hand">
        <ManualInvoiceForm
          month={month}
          banks={banks}
          lastSacCode={state?.lastSacCode ?? null}
          onDone={() => { setManual(false); void reload(); }}
          onCancel={() => setManual(false)}
        />
      </Sheet>
    </FlowFrame>
  );
}
