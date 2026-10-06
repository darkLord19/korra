import { describe, expect, it } from "vitest";
import { dismissPrivacyNotice, isPrivacyNoticeDismissed, PRIVACY_NOTICE_KEY } from "./privacy-notice";

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };

describe("privacy notice memory", () => {
  it("shows until dismissed, then stays dismissed", () => {
    const s = memory();
    expect(isPrivacyNoticeDismissed(s)).toBe(false);
    dismissPrivacyNotice(s);
    expect(isPrivacyNoticeDismissed(s)).toBe(true);
  });

  it("lives under the app's key prefix, so deleting all local data brings the notice back", () => {
    const s = memory();
    dismissPrivacyNotice(s);
    expect([...s.m.keys()]).toEqual([PRIVACY_NOTICE_KEY]);
    expect(PRIVACY_NOTICE_KEY.startsWith("korra.")).toBe(true);
  });

  it("copes with blocked or missing storage", () => {
    expect(isPrivacyNoticeDismissed(blocked)).toBe(false);
    expect(() => dismissPrivacyNotice(blocked)).not.toThrow();
    expect(isPrivacyNoticeDismissed(null)).toBe(false);
    expect(() => dismissPrivacyNotice(null)).not.toThrow();
  });
});
