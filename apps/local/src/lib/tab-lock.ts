// Detecting other open Korra tabs. A restore or a wipe deletes IndexedDB databases, and a delete is BLOCKED while
// another tab has the database open (with PGliteWorker the leader tab's worker holds it): IndexedDB then keeps the
// delete pending and runs it later, after the user was told it failed. So before anything destructive we refuse
// to start if another tab exists. Each tab holds a shared Web Lock named `korra-tab:<id>` for as long as it lives.

export const TAB_LOCK_PREFIX = "korra-tab:";
/** PGliteWorker's leader-election lock (name from @electric-sql/pglite/worker): held by exactly one worker per database. */
export const PGLITE_ELECTION_LOCK_PREFIX = "pglite-election-lock:";

const g = globalThis as unknown as { __korraTabId?: string };

/** Idempotent. Does nothing where Web Locks are missing (the IndexedDB `blocked` handling is then the only guard). */
export function holdTabLock(): void {
  if (g.__korraTabId !== undefined || typeof navigator === "undefined" || !navigator.locks) return;
  const id = crypto.randomUUID();
  g.__korraTabId = id;
  void navigator.locks.request(`${TAB_LOCK_PREFIX}${id}`, () => new Promise<never>(() => undefined));
}

async function heldNames(): Promise<string[]> {
  const snapshot = await navigator.locks.query();
  return (snapshot.held ?? []).map((l) => l.name ?? "");
}

/** How many OTHER Korra tabs or windows are open right now (0 when this browser cannot tell). */
export async function otherTabCount(): Promise<number> {
  if (typeof navigator === "undefined" || !navigator.locks?.query) return 0;
  const own = g.__korraTabId === undefined ? null : `${TAB_LOCK_PREFIX}${g.__korraTabId}`;
  return (await heldNames()).filter((n) => n.startsWith(TAB_LOCK_PREFIX) && n !== own).length;
}

/**
 * After this tab closed its database worker: waits until no worker holds the database any more (the terminated
 * worker's connection closes a moment after `terminate()`). False when it is still held after `timeoutMs`.
 */
export async function waitForDatabaseRelease(timeoutMs = 5000): Promise<boolean> {
  if (typeof navigator === "undefined" || !navigator.locks?.query) return true;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (!(await heldNames()).some((n) => n.startsWith(PGLITE_ELECTION_LOCK_PREFIX))) return true;
    if (Date.now() >= deadline) return false;
    await new Promise((r) => setTimeout(r, 100));
  }
}
