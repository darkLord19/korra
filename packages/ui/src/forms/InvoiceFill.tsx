"use client";
import { useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { MAX_UPLOAD_BYTES, SUGGEST_MIME_TYPES, type ProfileSuggestionWire } from "@korra/backend/schemas";
import { Alert, cx } from "../components";
import { useApi } from "../context";
import { mimeOf } from "../lib/files";

export const COULDNT_READ = "Couldn't read details from this file; fill them in by hand.";
type Note = { tone: "success" | "info" | "warning"; message: string };

/**
 * "Have an invoice handy?": a drop zone for one of the user's own export invoices. The adapter reads it
 * (`api.extractProfileFromInvoice`: parse only, nothing stored) and `apply` puts the suggestion into the form
 * and says what it did. Nothing is saved from here.
 */
export function InvoiceFill({ apply }: { apply: (s: ProfileSuggestionWire, file: File) => Note }) {
  const api = useApi();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [reading, setReading] = useState<string | null>(null);
  const [note, setNote] = useState<Note | null>(null);

  async function read(file: File) {
    const mime = mimeOf(file);
    if (!mime || !(SUGGEST_MIME_TYPES as readonly string[]).includes(mime)) return setNote({ tone: "warning", message: "Use a PDF of your invoice." });
    if (file.size > MAX_UPLOAD_BYTES) return setNote({ tone: "warning", message: "Files are limited to 20 MB." });
    if (file.size === 0) return setNote({ tone: "warning", message: "This file is empty." });
    setNote(null);
    setReading(file.name);
    try {
      setNote(apply(await api.extractProfileFromInvoice(file), file));
    } catch {
      setNote({ tone: "warning", message: COULDNT_READ });
    } finally {
      setReading(null);
    }
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) void read(f); };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ""; };

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cx("flex flex-wrap items-center justify-between gap-3 rounded-lg border-2 border-dashed px-4 py-3 sm:flex-nowrap", over ? "border-accent bg-accent-soft" : "border-line")}
      >
        <div className="min-w-0 text-sm">
          <p className="font-medium">Have an invoice handy? Drop it here to fill this in</p>
          <p className="text-xs text-muted">A PDF of one of your own export invoices. Only empty fields are filled, and nothing is saved until you press the button below.</p>
        </div>
        <button type="button" disabled={reading !== null} onClick={() => input.current?.click()} className="shrink-0 rounded-md border border-line bg-surface px-3 py-1.5 text-sm font-medium hover:bg-accent-soft disabled:opacity-60">
          {reading ? "Reading..." : "Choose invoice"}
        </button>
        <input ref={input} type="file" accept={SUGGEST_MIME_TYPES.join(",")} hidden onChange={onPick} aria-label="Choose an invoice to fill this in" data-testid="invoice-fill-input" />
      </div>
      {reading && <p role="status" className="text-sm text-muted">Reading {reading}...</p>}
      {note && <Alert tone={note.tone}>{note.message}</Alert>}
    </div>
  );
}
