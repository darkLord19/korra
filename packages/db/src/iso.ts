// Isomorphic entry (`@korra/db/iso`): runs in the browser and on the server. No Node APIs, no postgres-js,
// no Supabase, no "server-only". Server-only adapters are exported from index.ts.

export const PACKAGE = "@korra/db";

export type { Db } from "./db-type";
export { createRepos, newId } from "./repos";
export type {
  Actor,
  Repos,
  RepoOptions,
  DocumentRecord,
  DocumentKind,
  DocumentStatus,
  PackRecord,
  PackFile,
  CaShareRecord,
} from "./repos";
export { ForbiddenError, NotFoundError, ValidationError } from "./errors";
export {
  findStuckIngests,
  failExhaustedIngests,
  getDocumentForSystem,
  listNotificationState,
  recordNotification,
  countCasWithAtLeast,
} from "./system";
export type { NotificationUserState } from "./system";
export { createMemoryBlobStore, blobKeyFor } from "./blob-core";
export type { BlobStore, MemoryBlobStore } from "./blob-core";

/** Drizzle schema (Better Auth tables + domain). Pass to `drizzleAdapter(db, { provider: "pg", schema })`. */
export * as schema from "./schema";
