"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Card, CardBody, CardHeader } from "@korra/ui";
import { runBackup } from "@/lib/data-ops";
import { isProtected, persistLabel } from "@/lib/data-safety";
import { dismissNudge, setFlow, useNudgeDismissed } from "@/lib/flow";
import { useSafety } from "@/lib/safety-store";
import { SafariAdvice } from "./SafetyBanners";

export function KeepTrackingCard() {
  const router = useRouter();
  const s = useSafety();
  const dismissed = useNudgeDismissed();
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const waitlistUrl = process.env.NEXT_PUBLIC_KORRA_WAITLIST_URL;

  const keepTracking = () => {
    setFlow("tracking");
    router.push("/tracker");
  };

  const handleBackup = async () => {
    setBusy(true);
    setError(null);
    try {
      const file = await runBackup();
      setSaved(`Saved ${file}`);
    } catch (e) {
      console.error("[korra] backup failed", e);
      setError("The backup did not finish. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (dismissed) {
    return (
      <div className="mt-8 text-center text-xs text-muted">
        <button type="button" onClick={keepTracking} className="underline hover:text-foreground">
          Keep tracking in this browser
        </button>
      </div>
    );
  }

  const unprotected = s.persist !== "checking" && !isProtected(s.persist);

  return (
    <div className="mt-8">
      <Card aria-labelledby="keep-tracking-h">
        <CardHeader
          id="keep-tracking-h"
          title="Your EDF pack is ready. Want Korra to keep watching these invoices?"
        />
        <CardBody className="space-y-4">
          <p className="text-sm">
            The next deadline is the realisation due date (9 months, or 12 for INR). Korra can track it, remind you through the calendar file, and keep each month in one place.
          </p>

          <div className="flex flex-wrap items-center gap-3">
            <Button onClick={keepTracking}>Keep tracking in this browser</Button>
            <Button variant="secondary" disabled={busy} onClick={() => void handleBackup()}>
              {busy ? "Backing up..." : "Download a backup"}
            </Button>
            <Button variant="ghost" size="sm" onClick={dismissNudge}>
              Not now
            </Button>
          </div>

          {saved && <p className="text-xs text-ok">{saved}</p>}
          {error && <p className="text-xs text-danger">{error}</p>}

          {unprotected ? (
            <section aria-label="Storage warning">
              <Alert tone="warning" title="Your data is not protected from being cleared">
                <p>
                  Your browser can delete the data Korra keeps here when it needs space, and Korra has no server copy. Back up regularly.
                  <SafariAdvice />
                </p>
              </Alert>
            </section>
          ) : (
            s.persist !== "checking" && (
              <p className="text-xs text-muted">Storage: {persistLabel(s.persist)}</p>
            )
          )}

          {waitlistUrl && (
            <div className="pt-2">
              <a
                href={waitlistUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-accent underline hover:text-accent-hover"
              >
                Get notified when accounts with sync &amp; email reminders launch
              </a>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
