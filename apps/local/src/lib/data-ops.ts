"use client";
// Backup, restore and "delete all local data". The `.korra` format and the restore itself come from
// @korra/db/browser; this file adds what only the app can: the download, checks before anything is destroyed,
// closing the database first, and the reload afterwards.
import {
  applyRestore, BackupError, createBackup, DEFAULT_DATA_DIR, migrateBundled, MIGRATIONS, restoreBackup,
  type MigrationClient, type RestoredBackup,
} from "@korra/db/browser";
import type { PGlite as PGliteType } from "@electric-sql/pglite";
import { BLOB_DB_NAME, boot, shutdown } from "./boot";
import { backupFilename } from "./data-safety";
import { saveFile } from "./download";
import { clearOwnedStorage, recordBackup, setLifecycle, setNoticeForNextLoad } from "./safety-store";
import { setFlow } from "./flow";
import { currentMonthIST } from "@korra/ui";
import { otherTabCount, waitForDatabaseRelease } from "./tab-lock";

/** An error whose message is safe and useful to show as is. */
export class DataOpError extends Error {
  override name = "DataOpError";
}

const PGLITE_IDB_PREFIX = "/pglite/";
/** The IndexedDB database PGlite keeps its files in (same derivation as `applyRestore`). */
export const PGLITE_IDB_NAME = `${PGLITE_IDB_PREFIX}${DEFAULT_DATA_DIR.replace(/^idb:\/\//, "")}`;

const CLOSE_OTHER_TABS = "Korra is open in another tab or window. Close the other ones, then try again.";

/* ------------------------------------ backup ------------------------------------ */

/** Builds the `.korra` file, downloads it and records the time. Returns the filename. */
export async function runBackup(now: () => Date = () => new Date()): Promise<string> {
  const { pg, rawBlobs } = await boot();
  const at = now();
  const blob = await createBackup({ pg, blobs: rawBlobs, now: () => at });
  const filename = backupFilename(at);
  saveFile(blob, filename);
  recordBackup(at.getTime());
  return filename;
}

/* ------------------------------------ restore ------------------------------------ */

export interface PreparedRestore {
  restored: RestoredBackup;
  filename: string;
}

/**
 * Reads the whole dump through gunzip (which checks its checksum, so a truncated or corrupted file fails) and checks
 * that what comes out starts like a tar archive. This runs before PGlite sees the bytes: PGlite reports a garbage
 * dump through an unhandled stream error that no `catch` can see, so it must never be handed one.
 */
export async function checkDumpArchive(dump: Blob): Promise<void> {
  const reader = dump.stream().pipeThrough(new DecompressionStream("gzip")).getReader();
  const head = new Uint8Array(512);
  let seen = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (seen < head.length) head.set(value.subarray(0, head.length - seen), seen);
    seen += value.length;
  }
  if (seen < head.length || new TextDecoder().decode(head.subarray(257, 262)) !== "ustar") throw new Error("the database dump is not a tar archive");
}

/**
 * Loads the dump into a throwaway in-memory database and applies the bundled migrations to it. The helper that
 * replaces the real data (`applyRestore`) deletes the old database BEFORE it loads the dump, so a zip that
 * looks fine but holds a broken dump would destroy the person's data. Running the same steps on a scratch copy first
 * makes that case fail here, where nothing has been touched yet.
 */
export async function preflightDump(dataDir: Blob): Promise<void> {
  await checkDumpArchive(dataDir);
  const { PGlite } = await import("@electric-sql/pglite");
  let pg: PGliteType | null = null;
  try {
    pg = new PGlite({ loadDataDir: dataDir });
    await pg.waitReady;
    await migrateBundled(pg as unknown as MigrationClient, MIGRATIONS);
    await pg.query("select count(*) from exporter_profile");
  } finally {
    await pg?.close().catch(() => undefined);
  }
}

/**
 * Everything that can be checked without touching the current data: the zip, the manifest and its versions, the
 * blobs, and that the dump really loads. Throws `DataOpError` with a message for the person; changes nothing.
 */
export async function prepareRestore(file: Blob & { name?: string }): Promise<PreparedRestore> {
  let restored: RestoredBackup;
  try {
    restored = await restoreBackup(file);
  } catch (e) {
    throw new DataOpError(e instanceof BackupError ? e.message : "This file is not a Korra backup, or it is damaged.");
  }
  try {
    await preflightDump(restored.dataDir);
  } catch {
    throw new DataOpError("This backup is damaged: its database could not be read. Your current data was not changed.");
  }
  return { restored, filename: file.name ?? "backup.korra" };
}

/** Refuses (before anything is closed or deleted) while another Korra tab exists. */
export async function assertSingleTab(): Promise<void> {
  if ((await otherTabCount()) > 0) throw new DataOpError(CLOSE_OTHER_TABS);
}

const WAITING_FOR_OTHER_TABS = "Waiting for Korra to close in other tabs or windows. This finishes on its own once they are closed.";

/**
 * Deletes an IndexedDB database. `blocked` is not an error and there is deliberately NO timeout: once issued, a
 * delete cannot be cancelled and runs whenever the last connection closes, so giving up early would tell the person
 * "failed" while the delete still happens later. On `blocked` the screen says what it is waiting for, and this keeps waiting.
 */
export function deleteIndexedDb(name: string, onBlocked: () => void = () => undefined): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error(`Could not delete ${name}`));
    request.onblocked = onBlocked;
  });
}

const showWaitingForTabs = () => setLifecycle({ phase: "working", message: WAITING_FOR_OTHER_TABS });

function fail(e: unknown, what: string): void {
  console.error(`[korra] ${what} failed`, e);
  const message = e instanceof DataOpError ? e.message : `${what} did not finish.`;
  setLifecycle({ phase: "failed", message: `${message} Reload this page to continue.` });
}

/** Lets React unmount the screens (and stop their polling) before the database goes away. */
const settle = () => new Promise<void>((r) => setTimeout(r, 50));

/**
 * Replaces all local data with the prepared backup, then reloads the app on the restored store.
 *
 * NOT atomic. `applyRestore` deletes the old database, loads the dump, then rewrites the blobs; a crash or a full
 * disk in that window can leave the data missing or half-restored. What this function does to keep the risk low:
 * everything checkable is checked beforehand (`prepareRestore`), a second Korra tab is refused up front, and the
 * database is released before the delete so a transient `blocked` cannot make the restore give up after the delete is queued.
 */
export async function runRestore(prepared: PreparedRestore): Promise<void> {
  await assertSingleTab();
  setLifecycle({ phase: "working", message: "Restoring your backup. Keep this tab open." });
  try {
    await settle();
    const { rawBlobs } = await boot();
    await shutdown();
    if (!(await waitForDatabaseRelease())) throw new DataOpError(CLOSE_OTHER_TABS);
    await deleteIndexedDb(PGLITE_IDB_NAME, showWaitingForTabs);
    await applyRestore(prepared.restored, { blobs: rawBlobs });
  } catch (e) {
    fail(e, "The restore");
    return;
  }
  // The restored data is the state of that backup, so that is how recently it was backed up.
  const madeAt = Date.parse(prepared.restored.manifest.createdAt);
  clearOwnedStorage();
  if (Number.isFinite(madeAt)) recordBackup(madeAt);
  setNoticeForNextLoad("Your backup was restored.");
  setFlow("tracking");
  location.assign(`/month?m=${encodeURIComponent(currentMonthIST())}`);
}

/* ------------------------------------ delete all ------------------------------------ */

/** Every IndexedDB database of ours, by name: the known two, plus anything PGlite or the blob store left under those prefixes. */
async function ownedDatabases(): Promise<string[]> {
  const names = new Set([PGLITE_IDB_NAME, BLOB_DB_NAME]);
  try {
    for (const db of (await indexedDB.databases?.()) ?? []) {
      if (db.name && (db.name.startsWith(PGLITE_IDB_PREFIX) || db.name.startsWith("korra-"))) names.add(db.name);
    }
  } catch {
    // databases() is missing in older browsers; the known names are enough.
  }
  return [...names];
}

/** Wipes the PGlite database, the blob database and every key this app owns, then reloads to a fresh first run. */
export async function runDeleteAll(): Promise<void> {
  await assertSingleTab();
  setLifecycle({ phase: "working", message: "Deleting all local data. Keep this tab open." });
  try {
    await settle();
    await shutdown();
    if (!(await waitForDatabaseRelease())) throw new DataOpError(CLOSE_OTHER_TABS);
    for (const name of await ownedDatabases()) await deleteIndexedDb(name, showWaitingForTabs);
  } catch (e) {
    fail(e, "The deletion");
    return;
  }
  clearOwnedStorage();
  location.assign("/");
}
