// Dedicated worker for PGliteWorker. One worker per tab; PGliteWorker elects a leader (Web Locks) and only
// the leader's `init` runs, so only one PGlite instance ever has the IndexedDB store open. Migrations run in
// `init`, i.e. only on the leader.
import { PGlite } from "@electric-sql/pglite";
import { worker } from "@electric-sql/pglite/worker";
import { MIGRATIONS, migrateBundled, type MigrationClient } from "@korra/db/browser";

worker({
  async init(options) {
    const pg = new PGlite({ dataDir: options.dataDir, relaxedDurability: true });
    await pg.waitReady;
    await migrateBundled(pg as unknown as MigrationClient, MIGRATIONS);
    return pg;
  },
});
