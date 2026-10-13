"use client";
import { useState, type CSSProperties, type ReactNode } from "react";
import type { AdBankWire, BlockerWire, MonthStateWire, MoneyWire, OnboardingWire } from "@korra/backend/schemas";
import type { PackDownloads } from "../api";
import { Alert, EmptyState, Skeleton } from "../components";
import { useApi } from "../context";
import { errorMessage } from "../errors";
import { SignaturePad } from "../forms/SignaturePad";
import { FIELD_LABELS } from "../lib/format";
import { AckUpload } from "../pack/AckUpload";
import { SendPanel } from "../pack/SendPanel";
import { PackSummaryCard } from "../pack/PackSummary";
import { useLoaded } from "../screens/useLoaded";
import { FlowFrame } from "./FlowFrame";
import type { FlowProps } from "./types";

export type PackFlowProps = FlowProps & {
  /** Shown on the celebration after the pack was marked sent (apps/local passes its backup nudge). */
  afterSubmit?: ReactNode;
  /** Downloads the app already fetched, for the first render of a `submit` task. */
  initial?: PackDownloads;
};

const TOTAL = 4;
type Step = "sign" | "send" | "done";
const STEP_INDEX: Record<Step, number> = { sign: 1, send: 2, done: 3 };

function describeBlocker(b: BlockerWire): string {
  switch (b.kind) {
    case "missing_field": return b.entity === "exporter" ? `Your details are missing the ${FIELD_LABELS[b.field] ?? b.field}` : `An invoice is missing its ${FIELD_LABELS[b.field] ?? b.field}`;
    case "flagged_field": return `Please check the ${FIELD_LABELS[b.field] ?? b.field} on an invoice`;
    case "document_pending": return "A file is still being read";
    case "no_invoices": return "There are no invoices for this bank yet";
  }
}

/** Sums `amount` per currency. */
function totalsOf(amounts: MoneyWire[]): MoneyWire[] {
  const sums = new Map<string, bigint>();
  for (const a of amounts) sums.set(a.currency, (sums.get(a.currency) ?? 0n) + BigInt(a.minor));
  return [...sums.entries()].map(([currency, minor]) => ({ currency, minor: minor.toString() }));
}

/** The "building" animation: a few squares pulsing in turn. Still under reduced motion. */
function Building() {
  return (
    <div role="status" className="flex flex-col items-center gap-5 py-12 text-center">
      <div aria-hidden="true" className="flex gap-2">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className="size-5 animate-pulse rounded-md bg-accent motion-reduce:animate-none" style={{ animationDelay: `${i * 160}ms` }} />
        ))}
      </div>
      <p className="font-bold">Building your pack…</p>
      <p className="text-sm text-muted">Filling in the EDF and gathering your invoices.</p>
    </div>
  );
}

function MakeStep({ task, onDone, onClose }: FlowProps) {
  const api = useApi();
  const month = task.month ?? "";
  const adBankId = task.adBankId ?? "";
  const { data: state, error } = useLoaded<MonthStateWire>(() => api.getMonthState(month), undefined, `make:${month}`);
  const { data: ob, error: obError } = useLoaded<OnboardingWire>(() => api.getOnboarding(), undefined, "onboarding");
  const [building, setBuilding] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [failure, setFailure] = useState<string | null>(null);

  if (!state || (!ob && !obError)) {
    return (
      <FlowFrame title="Make your pack" step={{ index: 0, total: TOTAL }} onClose={onClose}>
        {error ? <Alert tone="danger">{error}</Alert> : <Skeleton className="h-40" />}
      </FlowFrame>
    );
  }

  const defaultBank = ob?.profile?.defaultAdBankId;
  const forBank = state.invoices.filter((i) => i.adBankId.value === adBankId || (!i.adBankId.value && defaultBank === adBankId));
  const amounts = forBank.flatMap((i) => (i.amount.value ? [i.amount.value] : []));
  const bank = state.blockersByBank.find((b) => b.adBankId === adBankId);
  const bankName = ob?.banks.find((b) => b.id === adBankId)?.name ?? bank?.adBankName ?? "your bank";

  async function make() {
    setBuilding(true);
    setProblems([]);
    setFailure(null);
    try {
      const res = await api.generatePack({ month, adBankId });
      if (res.ok) {
        onDone(`submit:${res.packId}`);
        return;
      }
      setProblems(res.blockers.map(describeBlocker));
    } catch (e) {
      setFailure(errorMessage(e));
    }
    setBuilding(false);
  }

  return (
    <FlowFrame
      title="Make your pack"
      step={{ index: 0, total: TOTAL }}
      onClose={onClose}
      primary={{ label: building ? "Making your pack…" : "Make my pack", pending: building, onClick: () => void make() }}
    >
      {building ? (
        <Building />
      ) : (
        <div className="space-y-4 animate-pop-in">
          <PackSummaryCard month={month} bankName={bankName} invoiceCount={forBank.length} totals={totalsOf(amounts)} />
          {bank?.placeholderLayout && (
            <Alert tone="warning">We couldn't find {bankName}'s own EDF form, so this pack uses the RBI format. Ask your branch if it's accepted.</Alert>
          )}
          {problems.length > 0 && (
            <Alert tone="danger" title="We can't make this pack yet">
              <ul className="list-inside list-disc">{problems.map((p, i) => <li key={i}>{p}</li>)}</ul>
            </Alert>
          )}
          {failure && <Alert tone="danger">{failure}</Alert>}
        </div>
      )}
    </FlowFrame>
  );
}

const CONFETTI = ["bg-accent", "bg-accent-2", "bg-ok", "bg-flag"];

/** A burst of small coloured pieces from the middle. Decorative, and nothing under reduced motion. */
function Confetti() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 18 }, (_, i) => {
        const angle = (i / 18) * Math.PI * 2;
        const reach = 90 + (i % 3) * 40;
        const style = {
          left: "50%",
          top: "30%",
          "--dx": `${Math.round(Math.cos(angle) * reach)}px`,
          "--dy": `${Math.round(Math.sin(angle) * reach + 60)}px`,
          "--rot": `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
          animationDelay: `${(i % 4) * 60}ms`,
        } as CSSProperties;
        return <span key={i} className={`animate-confetti absolute size-2 rounded-sm opacity-0 ${CONFETTI[i % CONFETTI.length]}`} style={style} />;
      })}
    </div>
  );
}

function SubmitSteps({ task, onDone, onClose, afterSubmit, initial }: PackFlowProps) {
  const api = useApi();
  const [packId, setPackId] = useState(task.packId ?? "");
  const { data, error, reload } = useLoaded<PackDownloads>(() => api.getPackDownloads(packId), initial?.pack.id === packId ? initial : undefined, packId);
  const [stepState, setStep] = useState<Step | null>(null);
  const [sent, setSent] = useState<boolean | null>(null);
  const [bank, setBank] = useState<AdBankWire | null>(null);
  const [redraw, setRedraw] = useState(false);
  const [ack, setAck] = useState<string | undefined>();
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!data) {
    return (
      <FlowFrame title="Your pack" onClose={onClose}>
        {error ? <Alert tone="danger">{error}</Alert> : <Skeleton className="h-48" />}
      </FlowFrame>
    );
  }

  const downloads: PackDownloads = bank ? { ...data, bank } : data;
  const step: Step = stepState ?? (data.pack.status === "submitted" ? "done" : data.signed ? "send" : "sign");
  const isSent = sent ?? data.pack.status === "submitted";
  const frame = { step: { index: STEP_INDEX[step], total: TOTAL }, onClose };
  const profile = data.profile ?? null;
  const signing = data.submission?.signing;

  /** Puts the saved signature on the pack by making it again (which may give it a new id), then moves on to Send. */
  async function applySignature() {
    setPending(true);
    setActionError(null);
    try {
      const res = await api.generatePack({ month: data!.pack.month, adBankId: data!.pack.adBankId });
      if (!res.ok) {
        setActionError(res.blockers.map(describeBlocker).join(". "));
        return;
      }
      setRedraw(false);
      setStep("send");
      if (res.packId !== packId) setPackId(res.packId);
      else await reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  async function markSent() {
    setPending(true);
    setActionError(null);
    try {
      await api.markPackSubmitted({ packId, ...(ack ? { ackDocumentId: ack } : {}) });
      setSent(true);
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  if (step === "sign") {
    const hasSignature = Boolean(profile?.signatureBlobKey);
    const showSaved = hasSignature && !redraw;
    return (
      <FlowFrame
        title="Sign your pack"
        {...frame}
        {...(showSaved ? { primary: { label: "Sign my pack", pending, onClick: () => void applySignature() } } : {})}
        secondary={{ label: "My bank needs a wet signature", onClick: () => setStep("send") }}
      >
        <p className="text-sm text-muted">Your signature gets stamped onto the EDF letter.</p>
        {signing?.note && <p className="text-sm text-muted">{signing.note}</p>}
        {showSaved ? (
          <div className="space-y-3 rounded-2xl border border-line bg-surface p-5">
            <p className="text-sm font-bold">Your saved signature</p>
            {profile?.signatureUrl && <img src={profile.signatureUrl} alt="Your signature" className="h-16 max-w-48 rounded-lg border border-line bg-surface p-1 object-contain" />}
            <p className="text-sm">{profile?.signatoryName || "Authorised signatory"}{profile?.signatoryDesignation ? ` (${profile.signatoryDesignation})` : ""}</p>
            <button type="button" onClick={() => setRedraw(true)} className="min-h-11 text-sm font-bold text-accent underline">Redraw</button>
          </div>
        ) : (
          <div className="space-y-3">
            <SignaturePad profile={profile ? { ...profile, signatureBlobKey: null } : null} regenerateLabel="Sign my pack" onSaved={() => void applySignature()} />
            {hasSignature && <button type="button" onClick={() => setRedraw(false)} className="min-h-11 text-sm font-bold text-accent underline">Keep my saved signature</button>}
          </div>
        )}
        {actionError && <Alert tone="danger">{actionError}</Alert>}
      </FlowFrame>
    );
  }

  if (step === "send") {
    return (
      <FlowFrame
        title="Send your pack"
        {...frame}
        primary={{ label: "I've sent it →", onClick: () => setStep("done") }}
      >
        <SendPanel downloads={downloads} onBankSaved={setBank} />
      </FlowFrame>
    );
  }

  if (isSent) {
    return (
      <FlowFrame title="All done" {...frame} primary={{ label: "Next up →", onClick: () => onDone() }}>
        <div className="relative">
          <Confetti />
          <div className="animate-pop-in">
            <EmptyState icon="🎉" title="Sent!">We'll keep an eye on payments for these invoices.</EmptyState>
          </div>
        </div>
        {afterSubmit}
      </FlowFrame>
    );
  }

  return (
    <FlowFrame
      title="Mark it as sent"
      {...frame}
      primary={{ label: "Mark as sent", pending, onClick: () => void markSent() }}
      secondary={{ label: "Back", onClick: () => setStep("send") }}
    >
      <p className="text-sm text-muted">Korra doesn't send anything for you. Marking it sent stops the reminders and starts watching for the payments.</p>
      <AckUpload month={data.pack.month} onUploaded={setAck} />
      {actionError && <Alert tone="danger">{actionError}</Alert>}
    </FlowFrame>
  );
}

/**
 * Make → Sign → Send → Done. `generate` tasks start at Make and hand over to the `submit:<packId>` task when the pack
 * exists; `submit` tasks load the pack and start at Sign (or Send when it is already signed, or Done when it was sent).
 */
export function PackFlow(props: PackFlowProps) {
  const { task, onClose } = props;
  if (task.kind === "generate" && task.month && task.adBankId) return <MakeStep key={task.id} task={task} onDone={props.onDone} onClose={onClose} />;
  if (task.kind === "submit" && task.packId) return <SubmitSteps key={task.packId} {...props} />;
  return (
    <FlowFrame title="Your pack" onClose={onClose}>
      <Alert tone="danger">This isn't a pack task.</Alert>
    </FlowFrame>
  );
}
