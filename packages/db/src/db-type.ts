import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import type * as schema from "./schema";

/**
 * Common supertype of the postgres-js database (production), the PGlite database (tests, browser).
 * Transactions (`db.transaction(tx => ...)`) hand out a `PgTransaction`, which extends this.
 * Lives in its own file so isomorphic code never has to name `postgres`.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;
