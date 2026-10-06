// Worker side of the browser database. The app's worker file is just:
//   import { startKorraPgliteWorker } from "@korra/db/browser";
//   startKorraPgliteWorker();
// One worker per tab; PGliteWorker elects a leader (Web Locks) and only the leader's `init` runs, so only one
// PGlite instance ever has the IndexedDB store open (plain `idb://` loses writes across tabs). Migrations run
// in `init`, i.e. on the leader only.
import { PGlite } from "@electric-sql/pglite";
import { worker } from "@electric-sql/pglite/worker";
import { migrateBundled, type MigrationClient } from "./browser-migrate";
import { MIGRATIONS } from "./migrations.generated";

export const DEFAULT_DATA_DIR = "idb://korra";

export function startKorraPgliteWorker(opts: { dataDir?: string } = {}): Promise<void> {
  return worker({
    async init(options) {
      const pg = new PGlite({ dataDir: opts.dataDir ?? options.dataDir ?? DEFAULT_DATA_DIR, relaxedDurability: true });
      await pg.waitReady;
      await migrateBundled(pg as unknown as MigrationClient, MIGRATIONS);
      return pg;
    },
  });
}
