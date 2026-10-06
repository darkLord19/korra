// Pure rules for keeping the person's data safe: persistent-storage status, backup age, when to nudge for a
// backup, and who needs the "Add to Home Screen" advice. No DOM, no storage: callers pass `now` and what they read,
// so every rule is unit-testable in node.

/** Everything the app writes to localStorage / sessionStorage lives under this prefix, so "delete all" can find it. */
export const KEY_PREFIX = "korra.";
export const LAST_BACKUP_KEY = `${KEY_PREFIX}lastBackupAt`;
export const PERSIST_ASKED_KEY = `${KEY_PREFIX}persistAskedAt`;
export const SESSION_PROMPTS_KEY = `${KEY_PREFIX}session.promptsShown`;
export const SESSION_NOTICE_KEY = `${KEY_PREFIX}session.notice`;

export const DAY_MS = 86_400_000;
/** A backup older than this (or none at all) triggers the reminder. */
export const STALE_AFTER_DAYS = 30;
/** How long before a refused `persist()` is asked again (Chrome and Safari decide silently and may change their mind). */
export const REASK_PERSIST_AFTER_DAYS = 7;

/* ------------------------------ persistent storage ------------------------------ */

export type PersistStatus = "protected" | "not-protected" | "unsupported";

/** `persisted` is the answer of `navigator.storage.persisted()` / `persist()`, or null when the API is missing or threw. */
export function persistStatus(input: { supported: boolean; persisted: boolean | null }): PersistStatus {
  if (!input.supported || input.persisted === null) return "unsupported";
  return input.persisted ? "protected" : "not-protected";
}

/** Only `protected` is safe; "unsupported" means the browser cannot promise anything, so it is treated as not protected. */
export const isProtected = (s: PersistStatus): boolean => s === "protected";

export function persistLabel(s: PersistStatus): string {
  return isProtected(s) ? "protected" : "not protected";
}

/** Ask when we never have, or when the last refusal is old enough that the browser may have changed its mind. */
export function shouldAskPersist(input: { persisted: boolean; askedAt: number | null; now: number }): boolean {
  if (input.persisted) return false;
  if (input.askedAt === null) return true;
  return input.now - input.askedAt >= REASK_PERSIST_AFTER_DAYS * DAY_MS;
}

/* ----------------------------------- Safari ----------------------------------- */

export interface BrowserEnv {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
  /** `navigator.standalone`: true when launched from the Home Screen (iOS). */
  standalone?: boolean;
  /** `matchMedia("(display-mode: standalone)")`. */
  displayModeStandalone?: boolean;
}

/**
 * WebKit storage rules apply (script-writable storage is cleared after 7 days without use): every browser on iOS
 * and iPadOS (they all run WebKit), and desktop Safari. Conservative: Chrome, Edge, Firefox and Opera on desktop
 * and Android are not matched, even though their user agents mention "Safari".
 */
export function isWebKit(env: BrowserEnv): boolean {
  const ua = env.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  // iPadOS 13+ presents a desktop Mac user agent; only a touch screen gives it away.
  const other = /Chrome|Chromium|CriOS|FxiOS|Firefox|Edg|EdgiOS|OPR|OPiOS|Android|SamsungBrowser/.test(ua);
  if (env.platform === "MacIntel" && (env.maxTouchPoints ?? 0) > 1 && !other) return true;
  return /Safari\//.test(ua) && !other;
}

/** Show the "Add to Home Screen / use a desktop browser" advice: WebKit, and not already running as a Home Screen app. */
export function shouldAdviseHomeScreen(env: BrowserEnv): boolean {
  return isWebKit(env) && env.standalone !== true && env.displayModeStandalone !== true;
}

/* ----------------------------------- backups ----------------------------------- */

/** localStorage holds a string of epoch milliseconds; anything else (missing, garbage, not positive) means "never". */
export function parseLastBackup(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Whole days since `lastBackupAt` (never negative: a clock that moved back counts as 0). Null when never backed up. */
export function backupAgeDays(lastBackupAt: number | null, now: number): number | null {
  if (lastBackupAt === null) return null;
  return Math.max(0, Math.floor((now - lastBackupAt) / DAY_MS));
}

export function isBackupStale(lastBackupAt: number | null, now: number): boolean {
  const age = backupAgeDays(lastBackupAt, now);
  return age === null || age > STALE_AFTER_DAYS;
}

/** `korra-backup-YYYY-MM-DD.korra`, in the person's local calendar date. */
export function backupFilename(date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `korra-backup-${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}.korra`;
}

/** "Last backup: ..." text, minus the label. */
export function describeLastBackup(lastBackupAt: number | null, now: number): string {
  const age = backupAgeDays(lastBackupAt, now);
  if (lastBackupAt === null || age === null) return "never";
  const when = new Date(lastBackupAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const ago = age === 0 ? "today" : age === 1 ? "1 day ago" : `${age} days ago`;
  return `${when} (${ago})`;
}

/* ------------------------------- backup prompts ------------------------------- */

export type PromptReason = "pack" | "stale";

export interface PromptContext {
  now: number;
  lastBackupAt: number | null;
  /** The person has set up their details (onboarding complete), so there is something to lose. */
  hasData: boolean;
  /** Reasons already shown in this browser session. */
  shown: readonly PromptReason[];
}

/**
 * Should the "Back up your data" banner appear for `reason`? At most once per session per reason.
 *   pack:  a pack was just generated (always worth a nudge: it is the work the person cares about);
 *   stale: there is data and the last backup is more than 30 days old, or there never was one.
 */
export function promptDue(reason: PromptReason, ctx: PromptContext): boolean {
  if (ctx.shown.includes(reason)) return false;
  if (reason === "pack") return true;
  return ctx.hasData && isBackupStale(ctx.lastBackupAt, ctx.now);
}

export function promptMessage(reason: PromptReason, lastBackupAt: number | null, now: number): string {
  if (reason === "pack") return "Your pack is ready. Save a copy of your data too, in case this browser clears it.";
  const age = backupAgeDays(lastBackupAt, now);
  return age === null
    ? "You have not backed up yet. Korra keeps your data only in this browser, so a backup file is your safety net."
    : `Your last backup was ${age} days ago. A fresh backup file is your safety net.`;
}

/** Parses the session list of prompts already shown; tolerant of anything unexpected. */
export function parseShown(raw: string | null | undefined): PromptReason[] {
  try {
    const v: unknown = JSON.parse(raw ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is PromptReason => x === "pack" || x === "stale") : [];
  } catch {
    return [];
  }
}
