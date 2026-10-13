"use client";
import { useState } from "react";
import type { UploadHint } from "../api";
import { Select } from "../components";
import { useApi } from "../context";
import { DropZone } from "./DropZone";

type Hint = "" | UploadHint;

/**
 * Hands each picked file to `api.uploadFile` (the adapter owns the transport). Checks type and size first so
 * the person gets a plain message without a round trip.
 */
export function UploadPanel({ month, defaultHint = "", compact = false, onUploaded, showHint = true }: {
  month: string;
  defaultHint?: Hint;
  compact?: boolean;
  /** Called after each file is stored (its reading may still be running). */
  onUploaded?: (documentId: string) => void;
  showHint?: boolean;
}) {
  const api = useApi();
  const [hint, setHint] = useState<Hint>(defaultHint);

  async function upload(file: File) {
    const { documentId } = await api.uploadFile(file, { month, ...(hint ? { hint } : {}) });
    onUploaded?.(documentId);
    return documentId;
  }

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
      <DropZone upload={upload} />
    </div>
  );
}
