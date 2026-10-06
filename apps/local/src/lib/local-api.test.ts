import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { NotFoundError, ValidationError } from "@korra/backend";
import { createTestDeps, createTestOwner, type TestDeps } from "@korra/backend/testing";
import { KorraApiError, UNSUPPORTED_FILE_MESSAGE } from "@korra/ui";
import { createIngestRunner } from "./ingest-runner";
import { call, createLocalApi } from "./local-api";
import { trackBlobs } from "./tracked-blobs";

const DEEL_CSV = readFileSync(fileURLToPath(new URL("../../../../packages/ingest/fixtures/deel/synthetic-transactions.csv", import.meta.url)));
const csvFile = () => new File([DEEL_CSV], "synthetic-transactions.csv", { type: "text/csv" });

/** Test deps whose ingester can be held back, to prove uploadFile does not wait for ingest. */
async function setup(opts: { runner?: "real" | "never" } = {}) {
  const base: TestDeps = await createTestDeps();
  const blobs = trackBlobs(base.blobs, () => undefined);
  const real = base.ingester;
  let hold: Promise<void> | null = null;
  const ingestCalls: string[] = [];
  const deps: TestDeps = {
    ...base,
    blobs: blobs as unknown as TestDeps["blobs"],
    ingester: { ingest: async (doc) => { ingestCalls.push(doc.filename); await hold; return real.ingest(doc); } },
  };
  const { ctx } = await createTestOwner(deps);
  const runner = createIngestRunner(deps, ctx, opts.runner === "never" ? async () => undefined : undefined);
  const local = createLocalApi({ ctx, blobs, ingest: runner, resumeEveryMs: 0 });
  return {
    ...local,
    deps,
    ingestCalls,
    holdIngest() {
      let open!: () => void;
      hold = new Promise<void>((r) => { open = r; });
      return open;
    },
  };
}

describe("call (error parity with the web server actions)", () => {
  it("turns domain errors into KorraApiErrors using the shared classifier", async () => {
    const v = await call(async () => { throw new ValidationError("legalName: Required; pan: Invalid PAN"); }).catch((e: unknown) => e);
    expect(v).toBeInstanceOf(KorraApiError);
    expect(v).toMatchObject({ kind: "validation", message: "legalName: Required; pan: Invalid PAN", fieldErrors: { legalName: "Required", pan: "Invalid PAN" } });
    await expect(call(async () => { throw new NotFoundError("AD bank not found"); })).rejects.toMatchObject({ kind: "not_found", message: "AD bank not found" });
  });

  it("hides unexpected errors behind the generic message and logs them", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(call(async () => { throw new Error("db exploded: secret detail"); })).rejects.toMatchObject({ kind: "unknown", message: "Something went wrong. Try again." });
    expect(error).toHaveBeenCalledOnce();
    error.mockRestore();
  });

  it("passes a KorraApiError through untouched", async () => {
    const e = new KorraApiError({ kind: "validation", message: "x" });
    await expect(call(async () => { throw e; })).rejects.toBe(e);
  });
});

describe("local KorraApi", () => {
  it("declares what the local app can do", async () => {
    expect((await setup()).api.capabilities).toEqual({ caSharing: false, accountDeletion: "local", backup: true });
  });

  it("rejects an unsupported file type before storing anything", async () => {
    const { api } = await setup();
    await expect(api.uploadFile(new File(["x"], "notes.txt", { type: "text/plain" }), { month: "2026-09" })).rejects.toMatchObject({ kind: "validation", message: UNSUPPORTED_FILE_MESSAGE });
    expect(await api.listDocuments("2026-09")).toEqual([]);
  });

  it("uploadFile resolves as soon as the file is stored; ingest runs in the background and the screens poll", async () => {
    const t = await setup();
    const release = t.holdIngest();
    const { documentId } = await t.api.uploadFile(csvFile(), { month: "2026-09" });
    // Stored and confirmed, ingest started but still held: the document is "ingesting", nothing is read yet.
    let month = await t.api.getMonthState("2026-09");
    expect(month.documents).toMatchObject([{ id: documentId, status: "ingesting" }]);
    expect(month.payments).toHaveLength(0);
    release();
    await vi.waitFor(async () => {
      month = await t.api.getMonthState("2026-09");
      expect(month.documents[0]).toMatchObject({ id: documentId, status: "ingested", kind: "statement" });
    });
    expect(month.payments).toHaveLength(3);
    expect(t.ingestCalls).toEqual(["synthetic-transactions.csv"]);
  });

  it("an acknowledgement (hint ack) is stored but never ingested", async () => {
    const t = await setup();
    const { documentId } = await t.api.uploadFile(new File([new Uint8Array([37, 80, 68, 70])], "ack.pdf", { type: "application/pdf" }), { month: "2026-09", hint: "ack" });
    expect((await t.api.listDocuments("2026-09"))[0]).toMatchObject({ id: documentId, status: "ingested", kind: "ack" });
    await new Promise((r) => setTimeout(r, 20));
    expect(t.ingestCalls).toEqual([]);
  });

  it("validation failures from the use-cases arrive as KorraApiErrors", async () => {
    const { api } = await setup();
    await expect(api.saveProfile({ legalName: "", address: "", pan: "bad", gstin: "bad" } as never)).rejects.toBeInstanceOf(KorraApiError);
    await expect(api.getPackDownloads("no-such-pack")).rejects.toBeInstanceOf(KorraApiError);
  });

  it("a document a closed tab left ingesting is picked up by getMonthState once it is stuck, and only run once", async () => {
    // "never" = the tab that uploaded it died before ingest ran.
    const t = await setup({ runner: "never" });
    const { documentId } = await t.api.uploadFile(csvFile(), { month: "2026-09" });
    expect((await t.api.getMonthState("2026-09")).documents[0]).toMatchObject({ id: documentId, status: "ingesting" });
    expect(t.ingestCalls).toEqual([]);

    // A new tab, after the stuck cutoff (10 minutes) has passed.
    const fresh = await createLaterTab(t.deps, 11 * 60_000);
    await Promise.all([fresh.api.getMonthState("2026-09"), fresh.api.getMonthState("2026-09"), fresh.resumeStuckIngests()]);
    await vi.waitFor(async () => expect((await fresh.api.getMonthState("2026-09")).documents[0]).toMatchObject({ status: "ingested" }));
    expect(t.ingestCalls).toEqual(["synthetic-transactions.csv"]);
  });
});

async function createLaterTab(deps: TestDeps, afterMs: number) {
  deps.setNow(new Date(deps.clock().getTime() + afterMs));
  const ctx = { deps, actor: { userId: (await deps.db.query.user.findFirst())!.id, role: "owner" as const } };
  const blobs = trackBlobs(deps.blobs as never, () => undefined);
  return createLocalApi({ ctx, blobs, ingest: createIngestRunner(deps, ctx), resumeEveryMs: 0 });
}
