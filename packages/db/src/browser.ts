// Browser entry (`@korra/db/browser`): drizzle over a caller-supplied PGlite (or PGliteWorker), the bundled migrator,
// the shared database worker, the IndexedDB blob store and `.korra` backups. No Node/server code.
import type { PGlite, PGliteInterface } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrateBundled, type MigrateResult, type MigrationClient } from "./browser-migrate";
import type { Db } from "./db-type";
import { MIGRATIONS } from "./migrations.generated";
import * as schema from "./schema";

export { migrateBundled } from "./browser-migrate";
export type { BundledMigration, MigrateResult, MigrationClient } from "./browser-migrate";
export { MIGRATIONS } from "./migrations.generated";
export { createIndexedDbBlobStore } from "./blob-idb";
export type { IndexedDbBlobStore, StoredBlob } from "./blob-idb";
export { BACKUP_FORMAT, BACKUP_VERSION, BackupError, createBackup, restoreBackup } from "./backup";
export type { BackupManifest, BackupSource, RestoredBackup } from "./backup";
export { DEFAULT_DATA_DIR, startKorraPgliteWorker } from "./browser-worker";
export { createWorkerClient } from "./browser-client";
export type { KorraPg } from "./browser-client";
export { applyRestore } from "./browser-restore";

/** Applies the bundled migrations, then returns the drizzle `Db` over the same client. */
export async function createBrowserDb(client: PGliteInterface): Promise<{ db: Db; migrate: MigrateResult }> {
  const migrate = await migrateBundled(client as unknown as MigrationClient, MIGRATIONS);
  return { db: drizzle(client as PGlite, { schema }) as unknown as Db, migrate };
}
