"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button } from "@korra/ui";
import { isProtected, shouldAdviseHomeScreen, type BrowserEnv } from "@/lib/data-safety";
import { dismissNotice, useSafety } from "@/lib/safety-store";

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
 * Banners above every screen: the one-off notice after a restore, and the storage warning (while the browser has not
 * promised to keep our data; it cannot be dismissed). The warning is one line, with the full text behind "How to
 * protect it". The "Back up your data" prompt is the Home backup task now. A phone hides them while a Home flow is
 * open (see `data-banner` in globals.css).
 */
export function SafetyBanners() {
  const s = useSafety();
  const unprotected = s.persist !== "checking" && !isProtected(s.persist);
  if (!s.notice && !unprotected) return null;
  return (
    <div data-banner className="mb-4 space-y-2">
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
        <section aria-label="Storage warning" className="rounded-xl border border-flag/40 bg-flag-soft px-3 text-[13px] sm:text-sm">
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 [&::-webkit-details-marker]:hidden">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-flag" />
              <span className="min-w-0 flex-1 font-medium">Your data could be cleared by the browser</span>
              {/* On a phone the label is a chevron (its name is still "How to protect it"): the line has no room for both. */}
              <span className="shrink-0 font-medium max-sm:sr-only sm:underline sm:group-open:no-underline">How to protect it</span>
              <span aria-hidden="true" className="shrink-0 transition-transform group-open:rotate-180 sm:hidden">▾</span>
            </summary>
            <p className="pb-3">
              Your browser can delete the data Korra keeps here when it needs space, and Korra has no server copy. Back up regularly.
              <SafariAdvice />{" "}
              <Link href="/settings" className="font-medium underline">Storage settings</Link>
            </p>
          </details>
        </section>
      )}
    </div>
  );
}
