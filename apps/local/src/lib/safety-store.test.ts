import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

class MemoryStorage {
  private m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => { this.m.set(k, v); };
  removeItem = (k: string) => { this.m.delete(k); };
  keys = () => [...this.m.keys()];
}
/** Object.keys(localStorage) must list the stored keys, like a real Storage. */
const storage = () => {
  const s = new MemoryStorage();
  return new Proxy(s, { ownKeys: () => s.keys(), getOwnPropertyDescriptor: (_t, k) => (typeof k === "string" && s.keys().includes(k) ? { enumerable: true, configurable: true, value: 1 } : undefined) });
};

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 6);

async function fresh() {
  vi.resetModules();
  return import("./safety-store");
}

describe("safety store", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", storage());
    vi.stubGlobal("sessionStorage", storage());
  });
  afterEach(() => vi.unstubAllGlobals());

  it("raises the pack prompt once per session, and a backup clears it", async () => {
    const s = await fresh();
    s.notifyPackGenerated(() => NOW);
    expect(s.getSafetyState().prompt).toBe("pack");
    s.dismissPrompt();
    s.notifyPackGenerated(() => NOW); // second pack, same session: no nag
    expect(s.getSafetyState().prompt).toBeNull();
    // ...also across a "reload" that keeps sessionStorage
    const again = await fresh();
    again.notifyPackGenerated(() => NOW);
    expect(again.getSafetyState().prompt).toBeNull();
  });

  it("raises the stale prompt for a 31-day-old backup, not for a 5-day-old one, and never without data", async () => {
    const old = await fresh();
    localStorage.setItem("korra.lastBackupAt", String(NOW - 31 * DAY));
    old.evaluateStalePrompt(false, () => NOW);
    expect(old.getSafetyState().prompt).toBeNull();
    old.evaluateStalePrompt(true, () => NOW);
    expect(old.getSafetyState().prompt).toBe("stale");

    sessionStorage.removeItem("korra.session.promptsShown");
    const recent = await fresh();
    localStorage.setItem("korra.lastBackupAt", String(NOW - 5 * DAY));
    recent.evaluateStalePrompt(true, () => NOW);
    expect(recent.getSafetyState().prompt).toBeNull();
  });

  it("a pack prompt replaces the stale one; recording a backup clears it and persists the time", async () => {
    const s = await fresh();
    s.evaluateStalePrompt(true, () => NOW); // never backed up
    expect(s.getSafetyState().prompt).toBe("stale");
    s.notifyPackGenerated(() => NOW);
    expect(s.getSafetyState().prompt).toBe("pack");
    s.recordBackup(NOW);
    expect(s.getSafetyState()).toMatchObject({ prompt: null, lastBackupAt: NOW });
    expect(localStorage.getItem("korra.lastBackupAt")).toBe(String(NOW));
  });

  it("clearOwnedStorage removes only keys with the app's prefix", async () => {
    const s = await fresh();
    localStorage.setItem("korra.lastBackupAt", "1");
    localStorage.setItem("someone-else", "x");
    sessionStorage.setItem("korra.session.notice", "n");
    s.clearOwnedStorage();
    expect(localStorage.getItem("korra.lastBackupAt")).toBeNull();
    expect(localStorage.getItem("someone-else")).toBe("x");
    expect(sessionStorage.getItem("korra.session.notice")).toBeNull();
  });

  it("keeps working when storage throws", async () => {
    vi.stubGlobal("localStorage", { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } });
    vi.stubGlobal("sessionStorage", { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); } });
    const s = await fresh();
    s.loadSafetyState();
    s.notifyPackGenerated(() => NOW);
    expect(s.getSafetyState().prompt).toBe("pack");
    s.dismissPrompt();
    s.notifyPackGenerated(() => NOW);
    expect(s.getSafetyState().prompt).toBeNull(); // the in-memory fallback still prevents nagging
  });

  it("persistence: asks first, reflects the answer, and does not re-ask within a week", async () => {
    const persist = vi.fn(async () => false);
    vi.stubGlobal("navigator", { storage: { persisted: async () => false, persist } });
    const s = await fresh();
    await s.initPersistence(() => NOW);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(s.getSafetyState().persist).toBe("not-protected");
    await s.initPersistence(() => NOW + DAY);
    expect(persist).toHaveBeenCalledTimes(1);
    await s.initPersistence(() => NOW + 8 * DAY);
    expect(persist).toHaveBeenCalledTimes(2);
  });

  it("persistence: granted, already persisted, and unsupported", async () => {
    vi.stubGlobal("navigator", { storage: { persisted: async () => false, persist: async () => true } });
    const granted = await fresh();
    await granted.initPersistence(() => NOW);
    expect(granted.getSafetyState().persist).toBe("protected");

    vi.stubGlobal("navigator", { storage: { persisted: async () => true, persist: vi.fn() } });
    const already = await fresh();
    await already.initPersistence(() => NOW);
    expect(already.getSafetyState().persist).toBe("protected");

    vi.stubGlobal("navigator", {});
    const none = await fresh();
    await none.initPersistence(() => NOW);
    expect(none.getSafetyState().persist).toBe("unsupported");
  });
});
