import "server-only";

export const PACKAGE = "@korra/db";

export { createDb } from "./db";
export type { Db } from "./db";
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
export { createSupabaseBlobStore, createMemoryBlobStore, blobKeyFor } from "./blob";
export type { BlobStore, MemoryBlobStore } from "./blob";

/** Drizzle schema (Better Auth tables + domain). Pass to `drizzleAdapter(db, { provider: "pg", schema })`. */
export * as schema from "./schema";
