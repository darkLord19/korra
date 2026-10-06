import { describe, expect, it } from "vitest";
import {
  backupAgeDays, backupFilename, DAY_MS, describeLastBackup, isBackupStale, isProtected, isWebKit, parseLastBackup, parseShown,
  persistLabel, persistStatus, promptDue, promptMessage, shouldAdviseHomeScreen, shouldAskPersist, STALE_AFTER_DAYS, type BrowserEnv,
} from "./data-safety";

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const ago = (days: number) => NOW - days * DAY_MS;

const UA = {
  safariMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  safariIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1",
  chromeIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.0.0 Mobile/15E148 Safari/604.1",
  firefoxIphone: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/127.0 Mobile/15E148 Safari/605.1.15",
  ipadDesktopMode: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15",
  chromeMac: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
  edge: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0",
  firefox: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:127.0) Gecko/20100101 Firefox/127.0",
  chromeAndroid: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36",
};

describe("persist status", () => {
  it("maps what the browser answered", () => {
    expect(persistStatus({ supported: true, persisted: true })).toBe("protected");
    expect(persistStatus({ supported: true, persisted: false })).toBe("not-protected");
    expect(persistStatus({ supported: false, persisted: null })).toBe("unsupported");
    expect(persistStatus({ supported: true, persisted: null })).toBe("unsupported"); // the call threw
    expect(persistStatus({ supported: false, persisted: true })).toBe("unsupported");
  });

  it("only 'protected' counts as safe, and says so", () => {
    expect(isProtected("protected")).toBe(true);
    expect(isProtected("not-protected")).toBe(false);
    expect(isProtected("unsupported")).toBe(false);
    expect(persistLabel("protected")).toBe("protected");
    expect(persistLabel("unsupported")).toBe("not protected");
  });

  it("asks on first run, and again only after a week of refusal", () => {
    expect(shouldAskPersist({ persisted: false, askedAt: null, now: NOW })).toBe(true);
    expect(shouldAskPersist({ persisted: false, askedAt: ago(1), now: NOW })).toBe(false);
    expect(shouldAskPersist({ persisted: false, askedAt: ago(7), now: NOW })).toBe(true);
    expect(shouldAskPersist({ persisted: true, askedAt: null, now: NOW })).toBe(false);
  });
});

describe("Safari / WebKit detection", () => {
  const env = (userAgent: string, rest: Partial<BrowserEnv> = {}): BrowserEnv => ({ userAgent, ...rest });
  it("matches desktop Safari and every iOS browser", () => {
    expect(isWebKit(env(UA.safariMac, { platform: "MacIntel", maxTouchPoints: 0 }))).toBe(true);
    expect(isWebKit(env(UA.safariIphone))).toBe(true);
    expect(isWebKit(env(UA.chromeIphone))).toBe(true);
    expect(isWebKit(env(UA.firefoxIphone))).toBe(true);
  });
  it("matches iPadOS pretending to be a Mac, but not a real Mac", () => {
    expect(isWebKit(env(UA.ipadDesktopMode, { platform: "MacIntel", maxTouchPoints: 5 }))).toBe(true);
    expect(isWebKit(env(UA.chromeMac, { platform: "MacIntel", maxTouchPoints: 5 }))).toBe(false);
  });
  it("does not match Chromium, Edge, Firefox or Android browsers, whose user agents also say Safari", () => {
    for (const ua of [UA.chromeMac, UA.edge, UA.firefox, UA.chromeAndroid]) expect(isWebKit(env(ua, { platform: "MacIntel", maxTouchPoints: 0 }))).toBe(false);
  });
  it("advises Add to Home Screen only in a WebKit browser tab, not an installed app", () => {
    expect(shouldAdviseHomeScreen(env(UA.safariIphone))).toBe(true);
    expect(shouldAdviseHomeScreen(env(UA.safariIphone, { standalone: true }))).toBe(false);
    expect(shouldAdviseHomeScreen(env(UA.safariIphone, { standalone: false, displayModeStandalone: true }))).toBe(false);
    expect(shouldAdviseHomeScreen(env(UA.chromeMac))).toBe(false);
  });
});

describe("last backup age", () => {
  it("parses only positive epoch milliseconds", () => {
    expect(parseLastBackup(String(ago(3)))).toBe(ago(3));
    for (const bad of [null, undefined, "", "  ", "abc", "0", "-5", "NaN", "Infinity"]) expect(parseLastBackup(bad)).toBeNull();
  });
  it("counts whole days, never negative, null when never", () => {
    expect(backupAgeDays(null, NOW)).toBeNull();
    expect(backupAgeDays(ago(0), NOW)).toBe(0);
    expect(backupAgeDays(NOW - (2 * DAY_MS - 1), NOW)).toBe(1);
    expect(backupAgeDays(ago(30), NOW)).toBe(30);
    expect(backupAgeDays(NOW + 5 * DAY_MS, NOW)).toBe(0);
  });
  it("is stale when never, or MORE than 30 days old", () => {
    expect(isBackupStale(null, NOW)).toBe(true);
    expect(isBackupStale(ago(STALE_AFTER_DAYS), NOW)).toBe(false);
    expect(isBackupStale(NOW - 31 * DAY_MS, NOW)).toBe(true);
    expect(isBackupStale(ago(1), NOW)).toBe(false);
  });
  it("names the file by local date and describes the age", () => {
    expect(backupFilename(new Date(2026, 9, 6, 23, 59))).toBe("korra-backup-2026-10-06.korra");
    expect(backupFilename(new Date(2026, 0, 5))).toBe("korra-backup-2026-01-05.korra");
    expect(describeLastBackup(null, NOW)).toBe("never");
    expect(describeLastBackup(ago(0), NOW)).toMatch(/\(today\)$/);
    expect(describeLastBackup(ago(1), NOW)).toMatch(/\(1 day ago\)$/);
    expect(describeLastBackup(ago(45), NOW)).toMatch(/\(45 days ago\)$/);
  });
});

describe("backup prompt scheduling", () => {
  const base = { now: NOW, lastBackupAt: ago(2), hasData: true, shown: [] as const };
  it("prompts after a pack, once per session", () => {
    expect(promptDue("pack", base)).toBe(true);
    expect(promptDue("pack", { ...base, shown: ["pack"] })).toBe(false);
    expect(promptDue("pack", { ...base, shown: ["stale"] })).toBe(true); // reasons are independent
  });
  it("prompts when stale or never, but only when there is data", () => {
    expect(promptDue("stale", base)).toBe(false);
    expect(promptDue("stale", { ...base, lastBackupAt: NOW - 31 * DAY_MS })).toBe(true);
    expect(promptDue("stale", { ...base, lastBackupAt: null })).toBe(true);
    expect(promptDue("stale", { ...base, lastBackupAt: null, hasData: false })).toBe(false);
    expect(promptDue("stale", { ...base, lastBackupAt: null, shown: ["stale"] })).toBe(false);
  });
  it("words the reminder for each reason", () => {
    expect(promptMessage("pack", null, NOW)).toMatch(/pack is ready/);
    expect(promptMessage("stale", null, NOW)).toMatch(/not backed up yet/);
    expect(promptMessage("stale", NOW - 45 * DAY_MS, NOW)).toMatch(/45 days ago/);
  });
  it("reads the session list defensively", () => {
    expect(parseShown('["pack","stale","x"]')).toEqual(["pack", "stale"]);
    for (const bad of [null, undefined, "", "{", '{"a":1}', "7"]) expect(parseShown(bad)).toEqual([]);
  });
});
