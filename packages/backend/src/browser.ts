// Browser Deps (`@korra/backend/browser`) for the client-only v0: everything runs in the tab, nothing leaves the
// device. Isomorphic imports only (no better-auth, resend, supabase, postgres, "server-only", Node APIs).
import { createIngester } from "@korra/ingest";
import { createLocalPdfExtractor, type LocalPdfExtractorOptions } from "@korra/ingest/pdf";
import { schema, type BlobStore, type Db } from "@korra/db";
import type { Ctx, Deps } from "./deps-types";

/** Fixed id of the single local user, so every reload acts as the same actor. */
export const LOCAL_OWNER_ID = "local-owner";
export const LOCAL_OWNER_EMAIL = "owner@local.invalid";

export interface LocalDepsOptions extends LocalPdfExtractorOptions {
  /** drizzle over PGlite / PGliteWorker (see `@korra/db/browser`). */
  db: Db;
  /** IndexedDB blob store (see `@korra/db/browser`). */
  blobs: BlobStore;
  clock?: () => Date;
}

/** Deps for the browser: local PDF extractor, no-op mailer, placeholder auth settings (Better Auth is never started). */
export function createLocalDeps(opts: LocalDepsOptions): Deps {
  const { db, blobs, clock, ...pdf } = opts;
  return {
    db,
    blobs,
    ingester: createIngester({ llm: createLocalPdfExtractor(pdf) }),
    mailer: { send: async () => undefined },
    clock: clock ?? (() => new Date()),
    appUrl: "http://localhost",
    authSecret: "local-only-not-used-local-only-not-used",
    authUrl: "http://localhost",
  };
}

/** Seeds the single local user on first run (idempotent) and returns the owner context. */
export async function ensureLocalOwner(deps: Deps): Promise<Ctx> {
  await deps.db
    .insert(schema.user)
    .values({ id: LOCAL_OWNER_ID, email: LOCAL_OWNER_EMAIL, name: "Local owner", emailVerified: true })
    .onConflictDoNothing();
  return { deps, actor: { userId: LOCAL_OWNER_ID, role: "owner" } };
}
