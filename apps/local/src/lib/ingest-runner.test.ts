import { describe, expect, it, vi } from "vitest";
import type { Ctx, Deps } from "@korra/backend";
import { createIngestRunner } from "./ingest-runner";

const deps = {} as Deps;
const ctx = {} as Ctx;

function gate() {
  let open!: () => void;
  const promise = new Promise<void>((r) => { open = r; });
  return { promise, open };
}

describe("createIngestRunner", () => {
  it("start returns at once and never runs the same document twice at the same time", async () => {
    const g = gate();
    const run = vi.fn(() => g.promise);
    const runner = createIngestRunner(deps, ctx, run, async () => []);
    runner.start("d1");
    runner.start("d1");
    expect(run).toHaveBeenCalledTimes(1);
    expect(runner.isRunning("d1")).toBe(true);
    g.open();
    await vi.waitFor(() => expect(runner.isRunning("d1")).toBe(false));
    runner.start("d1"); // finished: it may run again (a retry)
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("logs a failed job instead of leaving an unhandled rejection, and frees the document", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const runner = createIngestRunner(deps, ctx, async () => { throw new Error("boom"); }, async () => []);
    runner.start("d1");
    await vi.waitFor(() => expect(runner.isRunning("d1")).toBe(false));
    expect(error).toHaveBeenCalledWith("[korra] ingest failed", expect.any(Error));
    error.mockRestore();
  });

  it("resumeStuck starts the requeued documents, skipping any already running here", async () => {
    const g = gate();
    const run = vi.fn((_d: Deps, id: string) => (id === "busy" ? g.promise : Promise.resolve()));
    const runner = createIngestRunner(deps, ctx, run, async () => ["busy", "stuck"]);
    runner.start("busy");
    expect(await runner.resumeStuck()).toEqual(["stuck"]);
    expect(run.mock.calls.map((c) => c[1])).toEqual(["busy", "stuck"]);
    g.open();
  });
});
