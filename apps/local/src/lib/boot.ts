// Browser boot for the client-only app: PGlite (in a worker, on IndexedDB) + the IndexedDB blob store + the real
// backend use-cases, wired through `createLocalDeps`. Nothing here runs during prerender (it is called from an effect).
import type { Ctx } from "@korra/backend";
import { createLocalDeps, ensureLocalOwner } from "@korra/backend/browser";
import { createIndexedDbBlobStore, createWorkerClient, DEFAULT_DATA_DIR, type IndexedDbBlobStore, type KorraPg } from "@korra/db/browser";
import type { KorraApi } from "@korra/ui";
import { createIngestRunner } from "./ingest-runner";
import { createLocalApi } from "./local-api";
import { notifyPackGenerated } from "./safety-store";
import { holdTabLock } from "./tab-lock";
import { trackBlobs, type TrackedBlobs } from "./tracked-blobs";

/** Same-origin URL of the pdf.js worker copied into public/ by scripts/gen-assets.mjs. */
export const PDF_WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";
/** IndexedDB database of the blob store (PGlite's own data lives under `idb://korra`). */
export const BLOB_DB_NAME = "korra-blobs";

export interface Booted {
  api: KorraApi;
  /** The single local owner's context: for local-only features (exports) that read through the repositories, not `KorraApi`. */
  ctx: Ctx;
  pg: KorraPg;
  /** The IndexedDB blob store itself (backups need `exportAll`, a wipe needs `close`). */
  rawBlobs: IndexedDbBlobStore;
  /** The same store behind the download-URL bookkeeping the use-cases talk to. */
  blobs: TrackedBlobs;
}

const g = globalThis as unknown as { __korraLocalBoot?: Promise<Booted> };

/**
 * One instance per tab: a memoised promise on `globalThis`, so StrictMode, HMR and double calls never open two
 * PGlites. A failed boot is forgotten (and its worker stopped) so "Try again" really retries.
 */
export function boot(): Promise<Booted> {
  g.__korraLocalBoot ??= doBoot().catch((e: unknown) => {
    g.__korraLocalBoot = undefined;
    throw e;
  });
  return g.__korraLocalBoot;
}

async function doBoot(): Promise<Booted> {
  // Always PGliteWorker (never plain PGlite on idb://): with two tabs open a plain instance silently loses writes.
  const worker = new Worker(new URL("./pglite.worker.ts", import.meta.url), { type: "module" });
  try {
    // Resolves once the leader tab's PGlite is open and the bundled migrations are applied.
    const { db, pg } = await createWorkerClient(worker, { dataDir: DEFAULT_DATA_DIR });
    const rawBlobs = createIndexedDbBlobStore({ dbName: BLOB_DB_NAME });
    const blobs = trackBlobs(rawBlobs);
    const deps = createLocalDeps({ db, blobs, workerSrc: PDF_WORKER_SRC });
    const ctx = await ensureLocalOwner(deps);
    const ingest = createIngestRunner(deps, ctx);
    const { api, resumeStuckIngests } = createLocalApi({ ctx, blobs, ingest, onPackGenerated: () => notifyPackGenerated() });
    // Blob URLs for downloads pin their files in memory; let go of them when the tab goes away.
    addEventListener("pagehide", () => blobs.revokeAll());
    void resumeStuckIngests();
    holdTabLock();
    return { api, ctx, pg, rawBlobs, blobs };
  } catch (e) {
    worker.terminate();
    throw e;
  }
}

/**
 * Lets go of the database so its IndexedDB files can be replaced or deleted: the PGlite worker is closed (that
 * terminates it), the blob store connection is closed, and `boot()` is parked on a promise that never settles, so
 * nothing can quietly reopen the database before the page reloads. Callers must reload afterwards.
 * The screens should be unmounted first (BootGate does that while a restore or wipe is `working`).
 */
export async function shutdown(): Promise<void> {
  const current = g.__korraLocalBoot;
  g.__korraLocalBoot = new Promise<Booted>(() => undefined);
  if (!current) return;
  const booted = await current.catch(() => undefined);
  if (!booted) return;
  booted.blobs.revokeAll();
  await booted.pg.close();
  booted.rawBlobs.close();
}
