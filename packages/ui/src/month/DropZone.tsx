"use client";
import { useRef, useState, type ChangeEvent, type DragEvent, type ReactNode } from "react";
import { MAX_UPLOAD_BYTES } from "@korra/backend/schemas";
import { Badge, FileName, cx } from "../components";
import { isKorraApiError } from "../errors";
import { UNSUPPORTED_FILE_MESSAGE, mimeOf } from "../lib/files";

export interface DropItem {
  key: string;
  name: string;
  state: "uploading" | "done" | "error";
  message?: string | undefined;
  /** What `upload` returned for this file (a document id), once it is stored. */
  ref?: string | undefined;
}

/** Why a file cannot be uploaded, in words, or null when it is fine. Checked before any round trip. */
export function uploadProblem(file: File): string | null {
  if (!mimeOf(file)) return UNSUPPORTED_FILE_MESSAGE;
  if (file.size > MAX_UPLOAD_BYTES) return "Files are limited to 20 MB.";
  if (file.size === 0) return "This file is empty.";
  return null;
}

/**
 * A drop zone with a live list of the files it was given. Each file is checked (`uploadProblem`), then handed to
 * `upload`, which stores it (and may return a reference, such as a document id, kept on the item). `renderDone`
 * replaces the "Uploaded" badge for stored files, e.g. with their reading state.
 */
export function DropZone({ upload, title = "Drop files here, or", big = false, hintText = "PDF, PNG, JPG, WebP, CSV or XLSX. Up to 20 MB each.", buttonLabel = "Choose files", renderDone, onItems }: {
  upload: (file: File) => Promise<string | void>;
  title?: string;
  big?: boolean;
  hintText?: string;
  buttonLabel?: string;
  renderDone?: ((item: DropItem) => ReactNode) | undefined;
  /** Called whenever the list changes. */
  onItems?: ((items: DropItem[]) => void) | undefined;
}) {
  const [items, setItemsState] = useState<DropItem[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const latest = useRef<DropItem[]>([]);

  const setItems = (fn: (xs: DropItem[]) => DropItem[]) => {
    latest.current = fn(latest.current);
    setItemsState(latest.current);
    onItems?.(latest.current);
  };
  const patch = (key: string, p: Partial<DropItem>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  async function uploadOne(file: File, key: string) {
    const problem = uploadProblem(file);
    if (problem) return patch(key, { state: "error", message: problem });
    try {
      const ref = await upload(file);
      patch(key, { state: "done", ref: ref ?? undefined });
    } catch (e) {
      patch(key, { state: "error", message: isKorraApiError(e) ? e.message : "The upload failed. Check your connection and try again." });
    }
  }

  function addFiles(files: FileList | File[]) {
    const fresh = Array.from(files).map((f, i) => ({ f, key: `${Date.now()}-${i}-${f.name}` }));
    setItems((xs) => [...fresh.map(({ f, key }) => ({ key, name: f.name, state: "uploading" as const })), ...xs]);
    for (const { f, key } of fresh) void uploadOne(f, key);
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cx("border-2 border-dashed px-4 text-center", big ? "rounded-2xl py-12" : "rounded-lg py-8", over ? "border-accent bg-accent-soft" : "border-line")}
      >
        <p className={big ? "text-lg font-bold" : "text-sm"}>{title}</p>
        <button type="button" onClick={() => input.current?.click()} className={cx("mt-2 border border-line bg-surface font-medium hover:bg-accent-soft", big ? "min-h-12 rounded-full px-6 text-base" : "rounded-md px-4 py-2 text-sm")}>
          {buttonLabel}
        </button>
        <input ref={input} type="file" multiple hidden onChange={onPick} aria-label="Choose files to upload" data-testid="file-input" />
        <p className="mt-3 text-xs text-muted">{hintText}</p>
      </div>
      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line text-sm" aria-live="polite">
          {items.map((it) => (
            <li key={it.key} className="flex items-start justify-between gap-3 px-3 py-2">
              <div className="min-w-0 flex-1">
                <FileName name={it.name} />
                {it.message && <p className="mt-0.5 text-xs text-danger">{it.message}</p>}
              </div>
              <span className="flex shrink-0 items-center gap-2">
                {it.state === "uploading" && <Badge>Uploading</Badge>}
                {it.state === "done" && (renderDone ? renderDone(it) : <Badge tone="ok">Uploaded</Badge>)}
                {it.state === "error" && <Badge tone="danger">Failed</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
