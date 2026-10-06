/**
 * Test helpers (`@korra/backend/testing`). Wires PGlite + memory blobs + a fake extractor + a memory
 * mailer + a fixed (settable) clock. Does not import "server-only".
 */
import { createFakeExtractor, createIngester, type IngestResult } from "@korra/ingest";
import { createMemoryBlobStore, createTestDb, createTestUser, simulateBrowserPut, type MemoryBlobStore } from "@korra/db/testing";
import type { Actor, Db } from "@korra/db";
import type { Ctx, Deps } from "./deps-types";
import { createMemoryMailer, type MemoryMailer } from "./mailer";

export { createMemoryMailer, createTestDb, createTestUser, createMemoryBlobStore, simulateBrowserPut };
export type { MemoryMailer, MemoryBlobStore };

export interface TestDeps extends Deps {
  db: Db;
  blobs: MemoryBlobStore;
  mailer: MemoryMailer;
  /** Fixtures for the fake LLM extractor, keyed by filename. Mutate to add more. */
  fixtures: Record<string, IngestResult>;
  /** Moves the fixed clock. */
  setNow(date: Date | string): void;
}

export const TEST_NOW = "2026-11-02T10:00:00.000Z";

export async function createTestDeps(opts: { now?: Date | string; fixtures?: Record<string, IngestResult> } = {}): Promise<TestDeps> {
  let now = new Date(opts.now ?? TEST_NOW);
  const fixtures: Record<string, IngestResult> = { ...(opts.fixtures ?? {}) };
  // The fake extractor reads `fixtures` lazily so tests can add entries after construction.
  const llm = { extract: (doc: Parameters<ReturnType<typeof createFakeExtractor>["extract"]>[0]) => createFakeExtractor(fixtures).extract(doc) };
  return {
    db: await createTestDb(),
    blobs: createMemoryBlobStore(),
    ingester: createIngester({ llm }),
    mailer: createMemoryMailer(),
    clock: () => now,
    appUrl: "http://localhost:3000",
    authSecret: "test-secret-test-secret-test-secret-1234",
    authUrl: "http://localhost:3000",
    fixtures,
    setNow(d) {
      now = new Date(d);
    },
  };
}

/** Insert a user row directly (no auth flow) and return an owner ctx for them. */
export async function createTestOwner(deps: Deps, email?: string): Promise<{ id: string; email: string; ctx: Ctx }> {
  const u = await createTestUser(deps.db, email ? { email } : {});
  return { ...u, ctx: { deps, actor: { userId: u.id, role: "owner" } satisfies Actor } };
}

/** A CA ctx for `ownerUserId` (the share must be accepted for the repos to allow reads). */
export const caCtx = (deps: Deps, caUserId: string, ownerUserId: string): Ctx => ({
  deps,
  actor: { userId: caUserId, role: "ca", ownerUserId },
});
