"use client";
import { useState, useTransition } from "react";
import { Select } from "../components";
import { useApi } from "../context";
import { errorMessage } from "../errors";

export function NocSelect({ paymentId, options, onChanged }: {
  paymentId: string;
  options: { id: string; filename: string }[];
  onChanged?: (() => void) | undefined;
}) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <Select aria-label="Link a NOC document" defaultValue="" disabled={pending} className="w-44"
        onChange={(e) => {
          const documentId = e.target.value;
          if (!documentId) return;
          setError(null);
          start(async () => {
            try {
              await api.linkNoc({ paymentId, documentId });
              onChanged?.();
            } catch (err) {
              setError(errorMessage(err));
            }
          });
        }}>
        <option value="">Link a NOC...</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.filename}</option>)}
      </Select>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
