"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, useApi } from "@korra/ui";
import { runBackup } from "@/lib/data-ops";
import { isProtected, promptMessage, shouldAdviseHomeScreen, type BrowserEnv } from "@/lib/data-safety";
import { dismissNotice, dismissPrompt, evaluateStalePrompt, useSafety } from "@/lib/safety-store";

/** What the browser tells us about itself, read lazily (this only renders in the browser, after boot). */
export function readBrowserEnv(): BrowserEnv {
  const nav = navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav.userAgent,
    platform: nav.platform,
    maxTouchPoints: nav.maxTouchPoints,
    ...(nav.standalone !== undefined ? { standalone: nav.standalone } : {}),
    displayModeStandalone: typeof matchMedia === "function" && matchMedia("(display-mode: standalone)").matches,
  };
}

/** Short advice for browsers that can erase site data after a week of non-use. */
export function SafariAdvice() {
  const [advise, setAdvise] = useState(false);
  useEffect(() => setAdvise(shouldAdviseHomeScreen(readBrowserEnv())), []);
  return advise ? <> Safari also clears site data after 7 days without use. Add Korra to your Home Screen, or use a desktop browser.</> : null;
}

/**
 * Banners above every screen: the one-off notice after a restore, the storage warning (while the browser has not
 * promised to keep our data; it cannot be dismissed), and the "Back up your data" reminder.
 */
export function SafetyBanners() {
  const api = useApi();
  const s = useSafety();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Once per page load: is there data (onboarding done) and has the last backup gone stale?
  useEffect(() => {
    let live = true;
    api.getOnboarding().then(
      (ob) => { if (live) evaluateStalePrompt(ob.complete); },
      () => undefined,
    );
    return () => { live = false; };
  }, [api]);

  const backUp = async () => {
    setBusy(true);
    setError(null);
    try {
      await runBackup();
    } catch (e) {
      console.error("[korra] backup failed", e);
      setError("The backup did not finish. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const unprotected = s.persist !== "checking" && !isProtected(s.persist);
  if (!s.notice && !unprotected && !s.prompt && !error) return null;
  return (
    <div className="mb-6 space-y-3">
      {s.notice && (
        <section aria-label="Notice">
          <Alert tone="success">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>{s.notice}</p>
              <Button variant="ghost" size="sm" onClick={dismissNotice}>Dismiss</Button>
            </div>
          </Alert>
        </section>
      )}
      {unprotected && (
        <section aria-label="Storage warning">
          <Alert tone="warning" title="Your data is not protected from being cleared">
            <p>
              Your browser can delete the data Korra keeps here when it needs space, and Korra has no server copy. Back up regularly.
              <SafariAdvice />{" "}
              <Link href="/settings" className="font-medium underline">Storage settings</Link>
            </p>
          </Alert>
        </section>
      )}
      {s.prompt && (
        <section aria-label="Backup reminder">
          <Alert tone="info" title="Back up your data">
            <p>{promptMessage(s.prompt, s.lastBackupAt, Date.now())}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" disabled={busy} onClick={() => void backUp()}>{busy ? "Backing up..." : "Back up now"}</Button>
              <Button size="sm" variant="secondary" onClick={dismissPrompt}>Later</Button>
            </div>
          </Alert>
        </section>
      )}
      {error && <section aria-label="Backup error"><Alert tone="danger">{error}</Alert></section>}
    </div>
  );
}
