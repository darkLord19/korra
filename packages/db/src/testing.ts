/**
 * Test helpers. Import from `@korra/db/testing`; never from production code.
 * Intentionally does not import "server-only".
 */
import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "./db";
import type { MemoryBlobStore } from "./blob";
import * as schema from "./schema";

export { createMemoryBlobStore } from "./blob";
export type { MemoryBlobStore } from "./blob";

// KORRA_MIGRATIONS_DIR lets a bundled consumer (apps/web dev mode) point at the folder, since
// import.meta.url is not a real file path once bundled.
const migrationsDir = (): string =>
  process.env.KORRA_MIGRATIONS_DIR ?? join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Fresh in-process Postgres (PGlite) with all migrations (including RLS) applied. */
export async function createTestDb(): Promise<Db & { $client: PGlite }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: migrationsDir() });
  return db;
}

/** Insert a Better Auth `user` row directly (tests have no auth server). Returns its id. */
export async function createTestUser(
  db: Db,
  opts: { id?: string; email?: string; name?: string } = {},
): Promise<{ id: string; email: string }> {
  const id = opts.id ?? randomUUID();
  const email = opts.email ?? `${id}@example.test`;
  await db.insert(schema.user).values({ id, email, name: opts.name ?? "Test User" });
  return { id, email };
}

/** Stands in for the browser PUT to the URL returned by `createUploadUrl` on a memory store. */
export function simulateBrowserPut(
  store: MemoryBlobStore,
  upload: { url: string; token: string },
  bytes: Uint8Array,
): void {
  if (!upload.url.startsWith("memory://")) throw new Error("not a memory:// upload url");
  store.completeUpload(upload.token, bytes);
}
