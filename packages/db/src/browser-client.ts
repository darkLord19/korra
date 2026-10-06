// Main-thread side: a drizzle `Db` over PGliteWorker.
import type { PGlite } from "@electric-sql/pglite";
import { PGliteWorker } from "@electric-sql/pglite/worker";
import { drizzle } from "drizzle-orm/pglite";
import type { Db } from "./db-type";
import * as schema from "./schema";
import { DEFAULT_DATA_DIR } from "./browser-worker";

export type KorraPg = PGliteWorker & { dumpDataDir(compression?: "none" | "gzip" | "auto"): Promise<Blob> };

/**
 * Starts (or joins) the shared database worker and returns the drizzle `Db` plus the underlying client
 * (for `dumpDataDir` / `close`). Pass the worker the bundler built, e.g.
 * `createWorkerClient(new Worker(new URL("./korra.worker.ts", import.meta.url), { type: "module" }))`
 * (a URL or string also works for a prebuilt worker file). Resolves once the leader is ready and migrated.
 */
export async function createWorkerClient(
  worker: Worker | URL | string,
  opts: { dataDir?: string } = {},
): Promise<{ db: Db; pg: KorraPg }> {
  const w = worker instanceof Worker ? worker : new Worker(worker, { type: "module" });
  const pg = new PGliteWorker(w, { dataDir: opts.dataDir ?? DEFAULT_DATA_DIR }) as unknown as KorraPg;
  await pg.waitReady;
  // PGliteWorker implements the query surface drizzle's pglite driver needs; the cast bridges its declared type.
  return { db: drizzle(pg as unknown as PGlite, { schema }) as unknown as Db, pg };
}
