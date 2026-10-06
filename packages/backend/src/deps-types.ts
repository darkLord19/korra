// Isomorphic: only types. `createDeps` (server adapters) lives in deps.ts.
import type { Actor, BlobStore, Db } from "@korra/db/iso";
import type { createIngester } from "@korra/ingest/iso";
import type { Mailer } from "./mailer-types";

export type Ingester = ReturnType<typeof createIngester>;

export interface Deps {
  db: Db;
  blobs: BlobStore;
  ingester: Ingester;
  mailer: Mailer;
  clock: () => Date;
  appUrl: string;
  /** Better Auth secret and base URL (deviation from the design doc's Deps: needed by createAuth). */
  authSecret: string;
  authUrl: string;
}
export interface Ctx {
  deps: Deps;
  actor: Actor;
}
