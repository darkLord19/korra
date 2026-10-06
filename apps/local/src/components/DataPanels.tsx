"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Alert, Button, Card, CardBody, CardHeader, Field, Input } from "@korra/ui";
import { DataOpError, prepareRestore, runBackup, runDeleteAll, runRestore, type PreparedRestore } from "@/lib/data-ops";
import { describeLastBackup, isProtected, persistLabel } from "@/lib/data-safety";
import { askPersist, useSafety } from "@/lib/safety-store";
import { SafariAdvice } from "./SafetyBanners";

const messageOf = (e: unknown, fallback: string) => (e instanceof DataOpError ? e.message : fallback);

/** Inline confirmation (not window.confirm): a labelled alertdialog that takes focus and closes on Escape. */
function Confirm({ id, title, children, onCancel }: { id: string; title: string; children: ReactNode; onCancel: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alertdialog"
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      onKeyDown={(e) => { if (e.key === "Escape") onCancel(); }}
      className="space-y-3 rounded-md border border-danger/40 bg-danger-soft p-4 text-sm outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      <h3 id={`${id}-title`} className="font-semibold">{title}</h3>
      <div id={`${id}-body`} className="space-y-2">{children}</div>
    </div>
  );
}

/** Settings slot: storage status, back up, restore. */
export function BackupPanel() {
  const s = useSafety();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [prepared, setPrepared] = useState<PreparedRestore | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [asking, setAsking] = useState(false);

  const backUp = async () => {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      setDone(`Saved ${await runBackup()}. Keep it somewhere safe, ideally off this device.`);
    } catch (e) {
      console.error("[korra] backup failed", e);
      setError("The backup did not finish. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const choose = async (file: File | undefined) => {
    if (!file) return;
    setRestoreError(null);
    setPrepared(null);
    setChecking(true);
    try {
      setPrepared(await prepareRestore(file));
    } catch (e) {
      setRestoreError(messageOf(e, "This file could not be read as a Korra backup. Your data was not changed."));
      setPickerKey((k) => k + 1); // clear the picker so the same file can be chosen again
    } finally {
      setChecking(false);
    }
  };

  const cancelRestore = () => { setPrepared(null); setPickerKey((k) => k + 1); };

  const confirmRestore = async () => {
    if (!prepared) return;
    try {
      await runRestore(prepared);
    } catch (e) {
      // Refused before anything was touched (another tab is open).
      setRestoreError(messageOf(e, "The restore could not start. Your data was not changed."));
      cancelRestore();
    }
  };

  const unprotected = s.persist !== "checking" && !isProtected(s.persist);
  return (
    <Card aria-labelledby="backup-h">
      <CardHeader id="backup-h" title="Back up and restore" description="A backup is one .korra file with everything: your details, invoices, packs and uploaded files." />
      <CardBody className="space-y-5">
        <div className="space-y-1 text-sm">
          <p>Storage: <strong>{s.persist === "checking" ? "checking..." : persistLabel(s.persist)}</strong></p>
          {unprotected && (
            <p className="text-muted">
              The browser has not promised to keep this data, so it can be cleared when space runs low.
              <SafariAdvice />{" "}
              <button type="button" className="underline" disabled={asking} onClick={() => { setAsking(true); void askPersist().finally(() => setAsking(false)); }}>Ask the browser again</button>
            </p>
          )}
          <p>Last backup: <strong>{describeLastBackup(s.lastBackupAt, Date.now())}</strong></p>
        </div>

        <div className="space-y-2">
          <Button disabled={busy} onClick={() => void backUp()}>{busy ? "Backing up..." : "Back up now"}</Button>
          {done && <Alert tone="success">{done}</Alert>}
          {error && <Alert tone="danger">{error}</Alert>}
        </div>

        <div className="space-y-2 border-t border-line pt-4">
          <Field id="restore-file" label="Restore from a backup file" hint="Choose a .korra file. You will be asked to confirm before anything changes.">
            <Input id="restore-file" aria-describedby="restore-file-hint" key={pickerKey} type="file" disabled={checking || prepared !== null} onChange={(e) => void choose(e.target.files?.[0])} />
          </Field>
          {checking && <p className="text-sm text-muted" role="status">Checking the file...</p>}
          {restoreError && <Alert tone="danger" title="Could not restore">{restoreError}</Alert>}
          {prepared && (
            <Confirm id="restore" title="Replace all your data with this backup?" onCancel={cancelRestore}>
              <p>
                Restoring <strong>replaces everything</strong> stored in this browser (your details, invoices, packs and files) with the contents of {prepared.filename}
                , made {new Date(prepared.restored.manifest.createdAt).toLocaleString("en-GB")}. This cannot be undone.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button variant="danger" onClick={() => void confirmRestore()}>Replace my data</Button>
                <Button variant="secondary" onClick={cancelRestore}>Cancel</Button>
              </div>
            </Confirm>
          )}
        </div>
      </CardBody>
    </Card>
  );
}

const DELETE_WORD = "DELETE";

/** Settings slot: the danger zone. */
export function DataPanel() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => { setOpen(false); setTyped(""); };
  const wipe = async () => {
    try {
      await runDeleteAll();
    } catch (e) {
      setError(messageOf(e, "Could not delete your data."));
      close();
    }
  };

  return (
    <Card aria-labelledby="data-h">
      <CardHeader id="data-h" title="Your data" description="Everything is stored only in this browser. Korra has no server copy, so there is no account to delete." />
      <CardBody className="space-y-3">
        <h3 className="text-sm font-semibold text-danger">Danger zone</h3>
        <p className="text-sm text-muted">Deleting wipes your details, invoices, packs and uploaded files from this browser, and Korra starts from scratch. Back up first if you may need them.</p>
        {error && <Alert tone="danger">{error}</Alert>}
        {!open ? (
          <Button variant="danger" onClick={() => { setError(null); setOpen(true); }}>Delete all local data</Button>
        ) : (
          <Confirm id="delete" title="Delete all local data?" onCancel={close}>
            <p>This permanently erases everything Korra stores in this browser. It cannot be undone.</p>
            <Field id="delete-word" label={`Type ${DELETE_WORD} to confirm`}>
              <Input id="delete-word" value={typed} autoComplete="off" onChange={(e) => setTyped(e.target.value)} />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="danger" disabled={typed.trim() !== DELETE_WORD} onClick={() => void wipe()}>Delete everything</Button>
              <Button variant="secondary" onClick={close}>Cancel</Button>
            </div>
          </Confirm>
        )}
      </CardBody>
    </Card>
  );
}
