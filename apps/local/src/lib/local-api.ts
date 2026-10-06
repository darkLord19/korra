import {
  confirmAllFields, confirmUpload, createInvoiceManually, createPaymentManually, decideAllocation, editField, generatePack,
  getMonthState, getOnboarding, getPackDownloads, getTracker, linkNoc, listDocuments, listPacks, markPackSubmitted, requestUpload,
  saveBank, saveProfile, toWireError, UNKNOWN_ERROR,
  type Ctx,
} from "@korra/backend";
import { isGuideFile, type RequestUploadInput } from "@korra/backend/schemas";
import { KorraApiError, UNSUPPORTED_FILE_MESSAGE, mimeOf, type KorraApi, type PackDownloads } from "@korra/ui";
import type { IngestRunner } from "./ingest-runner";
import type { TrackedBlobs } from "./tracked-blobs";

export interface LocalApiOptions {
  /** The single local owner's context (`ensureLocalOwner`). */
  ctx: Ctx;
  blobs: TrackedBlobs;
  ingest: IngestRunner;
  /** Called after `generatePack` succeeds (the layout uses it to suggest a backup). Never allowed to fail the call. */
  onPackGenerated?: () => void;
  /** How often `getMonthState` looks for documents stuck `ingesting` (the web app does it on every month load). */
  resumeEveryMs?: number;
  now?: () => number;
}

export interface LocalApi {
  api: KorraApi;
  /** Requeue documents a closed tab left `ingesting`. Safe to call any time; errors are logged, never thrown. */
  resumeStuckIngests(): Promise<void>;
}

/**
 * Runs one use-case and reports failures the way the web adapter does: a `KorraApiError` classified by the shared
 * `toWireError` (the web server actions use the same function). Only unexpected errors are logged.
 */
export async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof KorraApiError) throw e;
    const known = toWireError(e);
    if (!known) console.error("[korra] unexpected error", e);
    throw new KorraApiError(known ?? UNKNOWN_ERROR);
  }
}

/**
 * The local `KorraApi`: calls the backend use-cases directly, in the browser, as the single local owner.
 * Mirrors `apps/web/src/client/server-api.ts` + `server/actions.ts` (server actions become direct calls).
 */
export function createLocalApi({ ctx, blobs, ingest, onPackGenerated, resumeEveryMs = 60_000, now = Date.now }: LocalApiOptions): LocalApi {
  let lastResume = Number.NEGATIVE_INFINITY;
  let resuming: Promise<void> | null = null;

  const resumeStuckIngests = (): Promise<void> => {
    lastResume = now();
    resuming ??= ingest
      .resumeStuck()
      .then(() => undefined, (e: unknown) => console.error("[korra] could not resume stuck ingests", e))
      .finally(() => { resuming = null; });
    return resuming;
  };

  const api: KorraApi = {
    capabilities: { caSharing: false, accountDeletion: "local", backup: true },

    getOnboarding: () => call(() => getOnboarding(ctx)),
    saveProfile: (input) => call(() => saveProfile(ctx, input)),
    saveBank: (input) => call(() => saveBank(ctx, input)),

    getMonthState(month) {
      // Screens poll this while documents are being read, so it doubles as the "no cron" backstop (throttled).
      if (now() - lastResume >= resumeEveryMs) void resumeStuckIngests();
      return call(() => getMonthState(ctx, month));
    },
    listDocuments: (month) => call(() => listDocuments(ctx, month)),
    listPacks: (month) => call(() => listPacks(ctx, month)),

    async uploadFile(file, { month, hint }) {
      const mimeType = mimeOf(file);
      if (!mimeType) throw new KorraApiError({ kind: "validation", message: UNSUPPORTED_FILE_MESSAGE });
      const { documentId, key } = await call(async () => {
        const req = await requestUpload(ctx, { filename: file.name, mimeType: mimeType as RequestUploadInput["mimeType"], sizeBytes: file.size, month, ...(hint ? { hint } : {}) });
        // The "PUT": the bytes go straight into the IndexedDB blob store. Nothing is sent anywhere.
        const stored = await blobs.completeUpload(req.token, new Uint8Array(await file.arrayBuffer())).then(
          (storedKey) => storedKey,
          () => { throw new KorraApiError({ kind: "unknown", message: "The upload did not complete. Try again." }); },
        );
        return { documentId: req.documentId, key: stored };
      });
      const { ingest: shouldIngest } = await call(() => confirmUpload(ctx, documentId)).finally(() => blobs.releaseUrls(key));
      // Fire and forget, like the web's after(): screens poll getMonthState while the document is `ingesting`.
      if (shouldIngest) ingest.start(documentId);
      return { documentId };
    },

    editField: (input) => call(async () => { await editField(ctx, input); }),
    decideAllocation: (input) => call(async () => { await decideAllocation(ctx, input); }),
    linkNoc: (input) => call(() => linkNoc(ctx, input)),
    createInvoiceManually: (input) => call(() => createInvoiceManually(ctx, input)),
    createPaymentManually: (input) => call(() => createPaymentManually(ctx, input)),
    confirmAllFields: (input) => call(() => confirmAllFields(ctx, input)),

    generatePack: (input) =>
      call(async () => {
        const pack = await generatePack(ctx, input);
        try {
          if (pack.ok) onPackGenerated?.(); // a pack blocked by unchecked fields was not generated: nothing to back up yet
        } catch (e) {
          console.error("[korra] pack-generated listener failed", e);
        }
        return pack;
      }),
    getPackDownloads: (packId) =>
      call(async (): Promise<PackDownloads> => {
        const d = await getPackDownloads(ctx, packId);
        blobs.keepOnly(d.files.map((f) => f.url));
        // Read the guide from the store, not by fetching its blob: URL (connect-src 'self' would block that).
        const guide = d.files.find(isGuideFile);
        return { ...d, guideText: guide ? await blobs.readTextByUrl(guide.url) : null };
      }),
    markPackSubmitted: (input) => call(() => markPackSubmitted(ctx, input)),

    getTracker: () => call(() => getTracker(ctx)),
  };

  return { api, resumeStuckIngests };
}
