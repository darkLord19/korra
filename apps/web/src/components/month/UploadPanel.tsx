"use client";
import { useCallback, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import { ALLOWED_UPLOAD_MIME_TYPES, MAX_UPLOAD_BYTES, type RequestUploadInput } from "@korra/backend/schemas";
import { Badge, Select, cx } from "@/components/ui";

type UploadAction = (input: RequestUploadInput) => Promise<{ ok: true; upload: { documentId: string; uploadUrl: string } } | { ok: false; error: string }>;
type ConfirmAction = (documentId: string) => Promise<{ ok: true } | { ok: false; error: string }>;

type Hint = "" | "invoice" | "statement" | "fira" | "noc";
type Item = { key: string; name: string; state: "uploading" | "reading" | "done" | "error"; message?: string };

const MIME_BY_EXT: Record<string, string> = {
  csv: "text/csv", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

function mimeOf(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const byExt = MIME_BY_EXT[ext];
  const declared = file.type;
  if ((ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(declared)) return declared;
  return byExt ?? null; // some browsers report CSVs as application/vnd.ms-excel or ""
}

/**
 * Upload flow (design doc 7.5): server action requestUpload -> browser PUTs the file straight to the
 * signed upload URL (never through our server) -> server action confirmUpload, which schedules ingest.
 * The PUT mirrors supabase-js `uploadToSignedUrl`: multipart body with `cacheControl` and the file as the unnamed part.
 */
export function UploadPanel({ month, requestUploadAction, confirmUploadAction, defaultHint = "", compact = false, onUploaded, showHint = true }: {
  month: string;
  requestUploadAction: UploadAction;
  confirmUploadAction: ConfirmAction;
  defaultHint?: Hint;
  compact?: boolean;
  onUploaded?: (documentId: string) => void;
  showHint?: boolean;
}) {
  const router = useRouter();
  const [hint, setHint] = useState<Hint>(defaultHint);
  const [items, setItems] = useState<Item[]>([]);
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const patch = (key: string, p: Partial<Item>) => setItems((xs) => xs.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const uploadOne = useCallback(async (file: File, key: string) => {
    const fail = (message: string) => patch(key, { state: "error", message });
    const mimeType = mimeOf(file);
    if (!mimeType) return fail("This file type is not supported. Use PDF, PNG, JPG, WebP, CSV or XLSX.");
    if (file.size > MAX_UPLOAD_BYTES) return fail("Files are limited to 20 MB.");
    if (file.size === 0) return fail("This file is empty.");
    try {
      const req = await requestUploadAction({ filename: file.name, mimeType: mimeType as RequestUploadInput["mimeType"], sizeBytes: file.size, month, ...(hint ? { hint } : {}) });
      if (!req.ok) return fail(req.error);
      const body = new FormData();
      body.append("cacheControl", "3600");
      body.append("", new File([file], file.name, { type: mimeType }));
      const put = await fetch(req.upload.uploadUrl, { method: "PUT", body });
      if (!put.ok) return fail("The upload did not complete. Try again.");
      patch(key, { state: "reading" });
      const c = await confirmUploadAction(req.upload.documentId);
      if (!c.ok) return fail(c.error);
      patch(key, { state: "done" });
      onUploaded?.(req.upload.documentId);
      router.refresh();
    } catch {
      fail("The upload failed. Check your connection and try again.");
    }
  }, [month, hint, requestUploadAction, confirmUploadAction, onUploaded, router]);

  function addFiles(files: FileList | File[]) {
    const list = Array.from(files);
    const fresh = list.map((f, i) => ({ f, key: `${Date.now()}-${i}-${f.name}` }));
    setItems((xs) => [...fresh.map(({ f, key }) => ({ key, name: f.name, state: "uploading" as const })), ...xs]);
    for (const { f, key } of fresh) void uploadOne(f, key);
  }

  const onDrop = (e: DragEvent) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); };
  const onPick = (e: ChangeEvent<HTMLInputElement>) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; };

  return (
    <div className="space-y-3">
      {showHint && <div className="flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor={`hint-${compact ? "c" : "m"}`} className="block text-xs font-medium text-muted">What is it? (optional)</label>
          <Select id={`hint-${compact ? "c" : "m"}`} value={hint} onChange={(e) => setHint(e.target.value as Hint)} className="mt-1 w-56">
            <option value="">Let Korra work it out</option>
            <option value="invoice">Invoice</option>
            <option value="statement">Deel statement / transactions</option>
            <option value="fira">FIRA</option>
            <option value="noc">NOC</option>
          </Select>
        </div>
      </div>}
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true); }}
        onDragLeave={() => setOver(false)}
        onDrop={onDrop}
        className={cx("rounded-lg border-2 border-dashed px-4 py-8 text-center", over ? "border-accent bg-accent-soft" : "border-line")}
      >
        <p className="text-sm">Drop files here, or</p>
        <button type="button" onClick={() => input.current?.click()} className="mt-2 rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-accent-soft">
          Choose files
        </button>
        <input ref={input} type="file" multiple hidden onChange={onPick} aria-label="Choose files to upload" data-testid="file-input" />
        <p className="mt-3 text-xs text-muted">PDF, PNG, JPG, WebP, CSV or XLSX. Up to 20 MB each.</p>
      </div>
      {items.length > 0 && (
        <ul className="divide-y divide-line rounded-md border border-line text-sm" aria-live="polite">
          {items.map((it) => (
            <li key={it.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <span className="min-w-0 truncate">{it.name}</span>
              <span className="flex items-center gap-2">
                {it.message && <span className="text-xs text-danger">{it.message}</span>}
                {it.state === "uploading" && <Badge>Uploading</Badge>}
                {it.state === "reading" && <Badge tone="accent">Reading</Badge>}
                {it.state === "done" && <Badge tone="ok">Uploaded</Badge>}
                {it.state === "error" && <Badge tone="danger">Failed</Badge>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
