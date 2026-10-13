"use client";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Alert, Button, Card, CardBody, FlowFrame, useApi, type FlowProps, type Task } from "@korra/ui";
import { runBackup } from "@/lib/data-ops";
import { isBackupTaskDue, isProtected, persistLabel } from "@/lib/data-safety";
import { useSafety } from "@/lib/safety-store";
import { SafariAdvice } from "./SafetyBanners";

const BACKUP_TASK: Task = {
  id: "backup",
  kind: "backup",
  title: "Back up your data",
  detail: "Your data lives only in this browser. Keep a copy safe.",
  urgency: "fyi",
  icon: "💾",
};

/**
 * The Home task list's extra: "Back up your data" once a pack exists and the last backup is missing or a week old.
 * `refreshOn` re-checks the packs (a pack made in this session counts). Returns null until the first answer.
 */
export function useBackupTasks(refreshOn: unknown): Task[] | null {
  const api = useApi();
  const { lastBackupAt, prompt } = useSafety();
  const [hasPacks, setHasPacks] = useState<boolean | null>(null);

  useEffect(() => {
    let live = true;
    api.listPacks().then(
      (packs) => { if (live) setHasPacks(packs.length > 0); },
      () => { if (live) setHasPacks((prev) => prev ?? false); },
    );
    return () => { live = false; };
  }, [api, refreshOn, prompt]);

  const due = hasPacks !== null && isBackupTaskDue(hasPacks, lastBackupAt, Date.now());
  return useMemo(() => (hasPacks === null ? null : due ? [BACKUP_TASK] : []), [hasPacks, due]);
}

/** Download a backup. Shared by the Home task and the "pack sent" card. */
function useBackupAction() {
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (): Promise<boolean> => {
    setBusy(true);
    setError(null);
    try {
      setSaved(`Saved ${await runBackup()}`);
      return true;
    } catch (e) {
      console.error("[korra] backup failed", e);
      setError("The backup did not finish. Try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };
  return { busy, saved, error, run };
}

/** The storage warning (when the browser may clear our data), or the plain storage status. */
function StorageInfo() {
  const s = useSafety();
  if (s.persist === "checking") return null;
  if (!isProtected(s.persist)) {
    return (
      <section aria-label="Storage warning">
        <Alert tone="warning" title="Your data is not protected from being cleared">
          <p>
            Your browser can delete the data Korra keeps here when it needs space, and Korra has no server copy. Back up regularly.
            <SafariAdvice />
          </p>
        </Alert>
      </section>
    );
  }
  return <p className="text-xs text-muted">Storage: {persistLabel(s.persist)}</p>;
}

/** The flow for the `backup` task. */
export function BackupFlow({ onDone, onClose }: FlowProps) {
  const { busy, error, run } = useBackupAction();
  return (
    <FlowFrame
      title="Back up your data"
      onClose={onClose}
      primary={{ label: busy ? "Backing up..." : "Download a backup", pending: busy, onClick: () => { void run().then((ok) => { if (ok) onDone(); }); } }}
    >
      <div className="space-y-4">
        <p>Korra keeps your invoices and packs only in this browser, with no copy on a server. A backup file is your safety net: keep it somewhere safe, and restore it from Settings if the data is ever lost.</p>
        <StorageInfo />
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      </div>
    </FlowFrame>
  );
}

/** Shown on the "pack sent" celebration: a backup button, the storage warning, and the waitlist link when one is configured. */
export function AfterSubmitCard() {
  const { busy, saved, error, run } = useBackupAction();
  const waitlistUrl = process.env.NEXT_PUBLIC_KORRA_WAITLIST_URL;
  return (
    <Card>
      <CardBody className="space-y-3">
        <p className="font-bold">Keep a copy of your data</p>
        <p className="text-sm text-muted">Your pack is saved only in this browser.</p>
        <Button variant="secondary" disabled={busy} onClick={() => void run()}>{busy ? "Backing up..." : "Download a backup"}</Button>
        {saved && <p className="text-xs text-ok">{saved}</p>}
        {error && <p className="text-xs text-danger">{error}</p>}
        <StorageInfo />
        {waitlistUrl && (
          <a href={waitlistUrl} target="_blank" rel="noopener noreferrer" className="block text-sm text-accent underline hover:text-accent-hover">
            Get notified when accounts with sync &amp; email reminders launch
          </a>
        )}
      </CardBody>
    </Card>
  );
}

/** What Home renders for the task kinds it does not know. */
export const renderExtraTask = (task: Task, flow: FlowProps): ReactNode => (task.kind === "backup" ? <BackupFlow {...flow} /> : undefined);
