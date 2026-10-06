import { requeueStuckIngests, runIngest, type Ctx, type Deps } from "@korra/backend";

/**
 * Runs ingest jobs in this tab. The web app runs them in `after()` and a daily cron sweeps up the stuck ones; the
 * browser has no cron, so a tab closed mid-ingest leaves its document `ingesting` until a later tab requeues it
 * (`resumeStuck`). An in-tab set makes sure the same document never runs twice at once.
 */
export interface IngestRunner {
  /** Fire and forget: returns at once. Failures are logged; `runIngest` itself records the document's failure state. */
  start(documentId: string): void;
  isRunning(documentId: string): boolean;
  /** Requeues this owner's documents stuck `ingesting` (same rule as the web month page) and starts them. Resolves with the ids started. */
  resumeStuck(): Promise<string[]>;
}

export function createIngestRunner(
  deps: Deps,
  ctx: Ctx,
  run: (deps: Deps, id: string) => Promise<void> = runIngest,
  requeue: (ctx: Ctx) => Promise<string[]> = requeueStuckIngests,
): IngestRunner {
  const running = new Set<string>();
  const start = (id: string): boolean => {
    if (running.has(id)) return false;
    running.add(id);
    void run(deps, id)
      .catch((e: unknown) => console.error("[korra] ingest failed", e))
      .finally(() => running.delete(id));
    return true;
  };
  return {
    start: (id) => void start(id),
    isRunning: (id) => running.has(id),
    async resumeStuck() {
      const ids = await requeue(ctx);
      return ids.filter(start);
    },
  };
}
