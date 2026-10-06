import type { PaymentFacts } from "@korra/core";
import {
  failExhaustedIngests,
  findStuckIngests,
  getDocumentForSystem,
  type DocumentRecord,
} from "@korra/db";
import { IngestError, type IngestResult } from "@korra/ingest";
import type { Ctx, Deps } from "./deps";
import { NotFoundError, ValidationError } from "./errors";
import { MAX_UPLOAD_BYTES, confirmUploadInput, requestUploadInput, runIngestInput, type RequestUploadInput } from "./inputs";
import { documentWire, parse, rematch, repos, reposFor, requireOwner } from "./internal";
import type { DocumentWire, RequestUploadResult, SweepResult } from "./wire-types";

export const STUCK_AFTER_MS = 10 * 60 * 1000;
export const MAX_INGEST_ATTEMPTS = 3;

export async function requestUpload(ctx: Ctx, raw: RequestUploadInput): Promise<RequestUploadResult> {
  requireOwner(ctx);
  const input = parse(requestUploadInput, raw);
  const doc = await repos(ctx).documents.create({
    filename: input.filename,
    mimeType: input.mimeType,
    month: input.month,
    kind: input.hint ?? null,
  });
  const { url, token } = await ctx.deps.blobs.createUploadUrl(doc.blobKey, input.mimeType);
  return { documentId: doc.id, uploadUrl: url, token };
}

/**
 * Verifies the browser's PUT landed, then marks the document `ingesting`. The caller (a server
 * action) then runs `after(() => runIngest(deps, documentId))` when `ingest` is true.
 * Acknowledgement documents (hint "ack") are stored only: they go straight to `ingested`, never through
 * ingest, so `ingest` is false for them.
 */
export async function confirmUpload(ctx: Ctx, rawId: string): Promise<{ documentId: string; ingest: boolean }> {
  requireOwner(ctx);
  const documentId = parse(confirmUploadInput, rawId);
  const r = repos(ctx);
  const doc = await r.documents.get(documentId);
  if (doc.status !== "uploaded") return { documentId, ingest: doc.status === "ingesting" && doc.kind !== "ack" }; // already confirmed: do not count another attempt
  try {
    await ctx.deps.blobs.createDownloadUrl(doc.blobKey, 60); // existence check without downloading
  } catch {
    throw new ValidationError("The file has not finished uploading. Try again.");
  }
  if (doc.kind === "ack") {
    await r.documents.setStatus(documentId, "ingested");
    return { documentId, ingest: false };
  }
  await r.documents.setStatus(documentId, "ingesting");
  return { documentId, ingest: true };
}

export async function listDocuments(ctx: Ctx, month?: string): Promise<DocumentWire[]> {
  return (await repos(ctx).documents.list(month)).map(documentWire);
}

/* ------------------------------ ingest job ------------------------------ */

const TOLERANCE_NUM = 3n; // 3 %
const abs = (n: bigint) => (n < 0n ? -n : n);
const withinPct = (a: bigint, b: bigint) => abs(a - b) * 100n <= TOLERANCE_NUM * (a > b ? a : b);
const dayDiff = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86_400_000;

/** Payments a FIRA / NOC could belong to: same currency, amount within 3 %, date within 10 days. */
function candidates(
  all: PaymentFacts[],
  amount: { minor: bigint; currency: string } | null,
  date: string | null,
): { p: PaymentFacts; amountDiff: bigint; dateDiff: number }[] {
  if (!amount) return [];
  const out: { p: PaymentFacts; amountDiff: bigint; dateDiff: number }[] = [];
  for (const p of all) {
    const fa = p.foreignAmount.value;
    if (!fa || fa.currency !== amount.currency || !withinPct(fa.minor, amount.minor)) continue;
    const pd = p.date.value;
    if (date && pd && dayDiff(date, pd) > 10) continue;
    out.push({ p, amountDiff: abs(fa.minor - amount.minor), dateDiff: date && pd ? dayDiff(date, pd) : 0 });
  }
  return out;
}

function pickFiraTarget(incoming: Omit<PaymentFacts, "id">, all: PaymentFacts[]): PaymentFacts | null {
  const ref = incoming.firaRef.value;
  const rank = (p: PaymentFacts) => (ref !== null && p.firaRef.value === ref ? 0 : p.firaRef.value === null ? 1 : 2);
  const c = candidates(all, incoming.foreignAmount.value, incoming.date.value);
  c.sort(
    (x, y) =>
      rank(x.p) - rank(y.p) ||
      (x.amountDiff < y.amountDiff ? -1 : x.amountDiff > y.amountDiff ? 1 : 0) ||
      x.dateDiff - y.dateDiff ||
      (x.p.id < y.p.id ? -1 : 1),
  );
  return c[0]?.p ?? null;
}

async function applyResult(deps: Deps, doc: DocumentRecord, result: IngestResult): Promise<void> {
  const r = reposFor(deps, { userId: doc.userId, role: "owner" });
  await r.documents.deleteExtracted(doc.id); // idempotent re-run; throws ValidationError if the user has edits
  await r.documents.setKind(doc.id, result.kind);

  if (result.invoices.length > 0) {
    const profile = await r.profile.get();
    const bank = profile?.defaultAdBankId ?? null;
    await r.invoices.insertExtracted(
      doc.id,
      result.invoices.map((inv) => ({
        ...inv,
        adBankId: { value: bank, confidence: bank ? 1 : 0, source: "default" as const },
      })),
    );
  }

  if (result.kind === "fira") {
    const existing = await r.payments.list();
    for (const incoming of result.payments) {
      const target = pickFiraTarget(incoming, existing);
      if (target) {
        const { rail: _rail, ...fira } = incoming;
        void _rail;
        await r.payments.mergeFira(target.id, fira); // keeps the existing payment's rail
      } else {
        await r.payments.insertExtracted(doc.id, [incoming]);
      }
    }
  } else if (result.payments.length > 0) {
    await r.payments.insertExtracted(doc.id, result.payments);
  }

  if (result.kind === "noc" && result.nocRef) {
    const all = await r.payments.list();
    let c = candidates(all, result.nocRef.amount, result.nocRef.date);
    if (c.length > 1) c = c.filter((x) => x.amountDiff === 0n);
    if (c.length === 1) await r.payments.linkNoc(c[0]!.p.id, doc.id);
    // otherwise: left for the user to link by hand (linkNoc use-case)
  }

  await rematch(r);
}

/**
 * System job (not an actor call): ingest one document. Only acts on documents that are `ingesting`.
 * Retryable failures leave the document `ingesting` for the sweep (the attempt is already counted);
 * non-retryable ones mark it `failed` with a message the user can read.
 */
export async function runIngest(deps: Deps, rawId: string): Promise<void> {
  const documentId = parse(runIngestInput, rawId);
  const doc = await getDocumentForSystem(deps.db, documentId);
  if (!doc || doc.status !== "ingesting" || doc.kind === "ack") return;
  const r = reposFor(deps, { userId: doc.userId, role: "owner" });
  const fail = (message: string) => r.documents.setStatus(doc.id, "failed", message);

  let bytes: Uint8Array;
  try {
    bytes = await deps.blobs.get(doc.blobKey);
  } catch (e) {
    if (e instanceof NotFoundError) {
      await fail("The uploaded file could not be found. Please upload it again.");
      return;
    }
    console.error(`[korra] runIngest ${doc.id}: blob read failed`, e);
    return; // transient: sweep retries
  }
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    await fail("The file is larger than 20 MB.");
    return;
  }

  let result: IngestResult;
  try {
    const hint = doc.kind && doc.kind !== "unknown" ? doc.kind : undefined;
    result = await deps.ingester.ingest({ bytes, mimeType: doc.mimeType, filename: doc.filename, ...(hint ? { hint } : {}) });
  } catch (e) {
    if (e instanceof IngestError && !e.retryable) {
      await fail(e.message);
    } else {
      console.error(`[korra] runIngest ${doc.id}: ingest failed, will retry`, e);
    }
    return;
  }

  if (result.kind === "unknown" && result.invoices.length === 0 && result.payments.length === 0) {
    await r.documents.setKind(doc.id, "unknown");
    await fail(result.warnings.join(" ") || "Could not recognise this document.");
    return;
  }

  try {
    await applyResult(deps, doc, result);
  } catch (e) {
    if (e instanceof ValidationError) {
      await fail(e.message);
      return;
    }
    console.error(`[korra] runIngest ${doc.id}: saving results failed, will retry`, e);
    return;
  }
  await r.documents.setStatus(doc.id, "ingested");
}

/** Cron: re-run documents stuck `ingesting` for 10+ minutes (max 3 attempts), fail the exhausted ones. */
export async function sweepStuckIngests(deps: Deps): Promise<SweepResult> {
  const cutoff = new Date(deps.clock().getTime() - STUCK_AFTER_MS);
  const stuck = await findStuckIngests(deps.db, cutoff, MAX_INGEST_ATTEMPTS);
  for (const doc of stuck) {
    // Re-entering "ingesting" counts the attempt and restarts the stuck timer.
    await reposFor(deps, { userId: doc.userId, role: "owner" }).documents.setStatus(doc.id, "ingesting");
    await runIngest(deps, doc.id);
  }
  const failed = await failExhaustedIngests(deps.db, cutoff, MAX_INGEST_ATTEMPTS, deps.clock());
  return { requeued: stuck.length, failed };
}
