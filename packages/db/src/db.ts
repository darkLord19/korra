import { drizzle } from "drizzle-orm/postgres-js";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Common supertype of the postgres-js database (production) and the PGlite database (tests).
 * Transactions (`db.transaction(tx => ...)`) hand out a `PgTransaction`, which extends this.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/**
 * Connects through the Supabase transaction pooler (port 6543), which does not support
 * prepared statements, hence `prepare: false`. Migrations use DATABASE_URL_DIRECT instead.
 */
export function createDb(url: string): Db {
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}
