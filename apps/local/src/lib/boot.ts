// Browser boot for the client-only app: PGlite (in a worker, on IndexedDB) + the IndexedDB blob store + the real
// backend use-cases, wired through `createLocalDeps`. Nothing here runs during prerender (it is called from an effect).
import { createLocalDeps, ensureLocalOwner } from "@korra/backend/browser";
import { createIndexedDbBlobStore, createWorkerClient, DEFAULT_DATA_DIR, type KorraPg } from "@korra/db/browser";
import type { KorraApi } from "@korra/ui";
import { createIngestRunner } from "./ingest-runner";
import { createLocalApi } from "./local-api";
import { trackBlobs } from "./tracked-blobs";

/** Same-origin URL of the pdf.js worker copied into public/ by scripts/gen-assets.mjs. */
export const PDF_WORKER_SRC = "/pdfjs/pdf.worker.min.mjs";
/** IndexedDB database of the blob store (PGlite's own data lives under `idb://korra`). */
export const BLOB_DB_NAME = "korra-blobs";

export interface Booted {
  api: KorraApi;
  pg: KorraPg;
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
    const blobs = trackBlobs(createIndexedDbBlobStore({ dbName: BLOB_DB_NAME }));
    const deps = createLocalDeps({ db, blobs, workerSrc: PDF_WORKER_SRC });
    const ctx = await ensureLocalOwner(deps);
    const ingest = createIngestRunner(deps, ctx);
    const { api, resumeStuckIngests } = createLocalApi({ ctx, blobs, ingest });
    // Blob URLs for downloads pin their files in memory; let go of them when the tab goes away.
    addEventListener("pagehide", () => blobs.revokeAll());
    void resumeStuckIngests();
    return { api, pg };
  } catch (e) {
    worker.terminate();
    throw e;
  }
}
