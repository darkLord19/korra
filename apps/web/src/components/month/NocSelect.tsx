"use client";
import { useState, useTransition } from "react";
import { Select } from "@/components/ui";

export function NocSelect({ paymentId, options, link }: {
  paymentId: string;
  options: { id: string; filename: string }[];
  link: (paymentId: string, documentId: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <Select aria-label="Link a NOC document" defaultValue="" disabled={pending} className="w-44"
        onChange={(e) => { const id = e.target.value; if (!id) return; setError(null); start(async () => { const r = await link(paymentId, id); if (!r.ok) setError(r.error); }); }}>
        <option value="">Link a NOC...</option>
        {options.map((o) => <option key={o.id} value={o.id}>{o.filename}</option>)}
      </Select>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
