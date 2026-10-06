import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

import type { Db } from "./db-type";

export type { Db };

/**
 * Connects through the Supabase transaction pooler (port 6543), which does not support
 * prepared statements, hence `prepare: false`. Migrations use DATABASE_URL_DIRECT instead.
 */
export function createDb(url: string): Db {
  const client = postgres(url, { prepare: false });
  return drizzle(client, { schema });
}
