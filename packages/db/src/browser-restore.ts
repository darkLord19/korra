import { PGlite } from "@electric-sql/pglite";
import { DEFAULT_DATA_DIR } from "./browser-worker";
import { migrateBundled, type MigrationClient } from "./browser-migrate";
import { MIGRATIONS } from "./migrations.generated";
import type { IndexedDbBlobStore } from "./blob-idb";
import type { RestoredBackup } from "./backup";

/**
 * Replaces the local data with a restored backup. Steps: the caller closes its database client in THIS tab
 * (`await pg.close()`) and every other Korra tab must be closed (an open IndexedDB connection blocks the
 * delete); then this deletes the `idb://` store, loads the dump into a fresh one, applies any newer bundled
 * migrations, and rewrites the blob store. Reload the page afterwards.
 */
export async function applyRestore(
  restored: RestoredBackup,
  target: { blobs: Pick<IndexedDbBlobStore, "replaceAll">; dataDir?: string },
): Promise<void> {
  const dataDir = target.dataDir ?? DEFAULT_DATA_DIR;
  const idbName = `/pglite/${dataDir.replace(/^idb:\/\//, "")}`;
  await new Promise<void>((resolve, reject) => {
    const r = indexedDB.deleteDatabase(idbName);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error ?? new Error("Could not clear the local database"));
    r.onblocked = () => reject(new Error("Close all other Korra tabs, then try the restore again."));
  });
  const pg = new PGlite(dataDir, { loadDataDir: restored.dataDir });
  await pg.waitReady;
  try {
    await migrateBundled(pg as unknown as MigrationClient, MIGRATIONS);
  } finally {
    await pg.close();
  }
  await target.blobs.replaceAll(restored.blobs);
}
