"use client";
// Browser-side state for data safety: persistent-storage status, last backup, the backup banner, and the
// "working" lifecycle used while the database is closed for a restore or a wipe. A tiny external store
// (useSyncExternalStore): the booted app lives outside React, and pack generation (an api call) must be able to
// raise the banner that the layout shows.
import { useSyncExternalStore } from "react";
import {
  KEY_PREFIX, LAST_BACKUP_KEY, PERSIST_ASKED_KEY, SESSION_NOTICE_KEY, SESSION_PROMPTS_KEY,
  parseLastBackup, parseShown, persistStatus, promptDue, shouldAskPersist,
  type PersistStatus, type PromptReason,
} from "./data-safety";

export type Lifecycle = { phase: "idle" } | { phase: "working"; message: string } | { phase: "failed"; message: string };

export interface SafetyState {
  /** "checking" until the first answer from the browser. */
  persist: PersistStatus | "checking";
  lastBackupAt: number | null;
  /** The backup banner currently on screen, if any. */
  prompt: PromptReason | null;
  /** One-shot message shown after a reload (e.g. "Backup restored"). */
  notice: string | null;
  lifecycle: Lifecycle;
}

/* --------------------------- storage that may be unavailable --------------------------- */

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}
const ls = {
  get: (k: string) => safe(() => localStorage.getItem(k), null),
  set: (k: string, v: string) => safe(() => { localStorage.setItem(k, v); }, undefined),
};
// sessionStorage can be missing (blocked storage); the in-memory copy keeps "once per page load" working then.
let memoryShown: PromptReason[] = [];
const shownReasons = (): PromptReason[] => {
  const stored = safe(() => sessionStorage.getItem(SESSION_PROMPTS_KEY), null);
  return stored === null ? memoryShown : parseShown(stored);
};
const markShown = (r: PromptReason) => {
  memoryShown = [...new Set([...shownReasons(), r])];
  safe(() => { sessionStorage.setItem(SESSION_PROMPTS_KEY, JSON.stringify(memoryShown)); }, undefined);
};

/** Removes every localStorage and sessionStorage key this app owns (all start with `korra.`). */
export function clearOwnedStorage(): void {
  for (const area of [() => localStorage, () => sessionStorage]) {
    safe(() => {
      const s = area();
      for (const k of Object.keys(s)) if (k.startsWith(KEY_PREFIX)) s.removeItem(k);
    }, undefined);
  }
  memoryShown = [];
}

/* ------------------------------------- the store ------------------------------------- */

const initial: SafetyState = { persist: "checking", lastBackupAt: null, prompt: null, notice: null, lifecycle: { phase: "idle" } };
let state: SafetyState = initial;
const listeners = new Set<() => void>();

function set(patch: Partial<SafetyState>): void {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}
export const getSafetyState = (): SafetyState => state;
const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const useSafety = (): SafetyState => useSyncExternalStore(subscribe, getSafetyState, () => initial);

/* ------------------------------- persistent storage ------------------------------- */

async function readPersisted(): Promise<boolean | null> {
  try {
    const s = navigator.storage;
    return typeof s?.persisted === "function" ? await s.persisted() : null;
  } catch {
    return null;
  }
}

/**
 * First run: ask the browser to protect our storage and remember the answer. `persisted()` is the durable record
 * (the browser keeps it); we only remember when we last asked, so a refusal is retried after a week, not on every
 * page load (Firefox shows a prompt per call).
 */
export async function initPersistence(now: () => number = Date.now): Promise<void> {
  const supported = typeof navigator !== "undefined" && typeof navigator.storage?.persist === "function";
  let persisted = await readPersisted();
  if (supported && persisted === false && shouldAskPersist({ persisted, askedAt: parseLastBackup(ls.get(PERSIST_ASKED_KEY)), now: now() })) {
    persisted = await askPersist(now);
  }
  set({ persist: persistStatus({ supported, persisted }) });
}

/** Asks now (the "Ask again" button: a user gesture, which Firefox needs to show its prompt). */
export async function askPersist(now: () => number = Date.now): Promise<boolean | null> {
  ls.set(PERSIST_ASKED_KEY, String(now()));
  try {
    const granted = await navigator.storage.persist();
    set({ persist: persistStatus({ supported: true, persisted: granted }) });
    return granted;
  } catch {
    return await readPersisted();
  }
}

/* ----------------------------------- backups ----------------------------------- */

export function loadSafetyState(): void {
  const notice = safe(() => sessionStorage.getItem(SESSION_NOTICE_KEY), null);
  if (notice !== null) safe(() => { sessionStorage.removeItem(SESSION_NOTICE_KEY); }, undefined);
  set({ lastBackupAt: parseLastBackup(ls.get(LAST_BACKUP_KEY)), notice });
}

export function recordBackup(at: number): void {
  ls.set(LAST_BACKUP_KEY, String(at));
  set({ lastBackupAt: at, prompt: null });
}

export function dismissPrompt(): void {
  set({ prompt: null });
}
export function dismissNotice(): void {
  set({ notice: null });
}

/** Leave a message for the next page load (the restore reloads the page). */
export function setNoticeForNextLoad(message: string): void {
  safe(() => { sessionStorage.setItem(SESSION_NOTICE_KEY, message); }, undefined);
}

function maybePrompt(reason: PromptReason, hasData: boolean, now: number): void {
  const lastBackupAt = parseLastBackup(ls.get(LAST_BACKUP_KEY));
  if (!promptDue(reason, { now, lastBackupAt, hasData, shown: shownReasons() })) return;
  markShown(reason);
  set({ lastBackupAt, prompt: reason });
}

/** A pack was just generated (the local api's `generatePack` succeeded). */
export function notifyPackGenerated(now: () => number = Date.now): void {
  maybePrompt("pack", true, now());
}

/** Once per page load, after boot: has the last backup gone stale while there is data to lose? */
export function evaluateStalePrompt(hasData: boolean, now: () => number = Date.now): void {
  maybePrompt("stale", hasData, now());
}

/* ------------------------------------ lifecycle ------------------------------------ */

export function setLifecycle(l: Lifecycle): void {
  set({ lifecycle: l });
}
