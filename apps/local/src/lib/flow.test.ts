import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearOwnedStorage } from "./safety-store";

class MemoryStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => { this.m.set(k, v); };
  removeItem = (k: string) => { this.m.delete(k); };
  keys = () => [...this.m.keys()];
}

const storage = () => {
  const s = new MemoryStorage();
  return new Proxy(s, {
    ownKeys: () => s.keys(),
    getOwnPropertyDescriptor: (_t, k) => (typeof k === "string" && s.keys().includes(k) ? { enumerable: true, configurable: true, value: 1 } : undefined),
  });
};

async function fresh() {
  vi.resetModules();
  return import("./flow");
}

describe("flow store", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to 'new', reads and writes flags, and setFlow('new') removes the key", async () => {
    const f = await fresh();
    expect(f.getFlow()).toBe("new");

    f.setFlow("started");
    expect(f.getFlow()).toBe("started");
    expect(localStorage.getItem(f.FLOW_KEY)).toBe("started");

    f.setFlow("tracking");
    expect(f.getFlow()).toBe("tracking");
    expect(localStorage.getItem(f.FLOW_KEY)).toBe("tracking");

    f.setFlow("new");
    expect(f.getFlow()).toBe("new");
    expect(localStorage.getItem(f.FLOW_KEY)).toBeNull();
  });

  it("tracks nudge dismissal", async () => {
    const f = await fresh();
    expect(f.isNudgeDismissed()).toBe(false);

    f.dismissNudge();
    expect(f.isNudgeDismissed()).toBe(true);
    expect(localStorage.getItem(f.NUDGE_DISMISSED_KEY)).toBe("true");
  });

  it("is cleared by clearOwnedStorage", async () => {
    const f = await fresh();
    f.setFlow("tracking");
    f.dismissNudge();
    localStorage.setItem("other.key", "keep");

    expect(f.getFlow()).toBe("tracking");
    expect(f.isNudgeDismissed()).toBe(true);

    clearOwnedStorage();

    expect(f.getFlow()).toBe("new");
    expect(f.isNudgeDismissed()).toBe(false);
    expect(localStorage.getItem("other.key")).toBe("keep");
  });

  it("handles storage that throws without errors", async () => {
    vi.stubGlobal("localStorage", {
      getItem() { throw new Error("storage blocked"); },
      setItem() { throw new Error("storage blocked"); },
      removeItem() { throw new Error("storage blocked"); },
    });
    const f = await fresh();

    expect(f.getFlow()).toBe("new");
    expect(() => f.setFlow("tracking")).not.toThrow();
    expect(f.getFlow()).toBe("new");

    expect(f.isNudgeDismissed()).toBe(false);
    expect(() => f.dismissNudge()).not.toThrow();
    expect(f.isNudgeDismissed()).toBe(false);
  });
});
