// Browser entry (`@korra/db/browser`): drizzle over a caller-supplied PGlite (or PGliteWorker) plus the
// bundled migrator. The app constructs the PGlite instance so it controls the dataDir (idb://...).
import type { PGlite, PGliteInterface } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrateBundled, type MigrateResult, type MigrationClient } from "./browser-migrate";
import type { Db } from "./db-type";
import { MIGRATIONS } from "./migrations.generated";
import * as schema from "./schema";

export { migrateBundled } from "./browser-migrate";
export type { BundledMigration, MigrateResult, MigrationClient } from "./browser-migrate";
export { MIGRATIONS } from "./migrations.generated";

/** Applies the bundled migrations, then returns the drizzle `Db` over the same client. */
export async function createBrowserDb(client: PGliteInterface): Promise<{ db: Db; migrate: MigrateResult }> {
  const migrate = await migrateBundled(client as unknown as MigrationClient, MIGRATIONS);
  return { db: drizzle(client as PGlite, { schema }) as unknown as Db, migrate };
}
