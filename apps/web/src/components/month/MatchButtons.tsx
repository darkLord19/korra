"use client";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui";

export function MatchButtons({ invoiceId, paymentId, status, decide }: {
  invoiceId: string; paymentId: string; status: "proposed" | "confirmed";
  decide: (invoiceId: string, paymentId: string, decision: "confirm" | "reject") => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (d: "confirm" | "reject") => { setError(null); start(async () => { const r = await decide(invoiceId, paymentId, d); if (!r.ok) setError(r.error); }); };
  return (
    <div className="text-right">
      <div className="flex gap-2">
        {status === "proposed" && <Button size="sm" onClick={() => go("confirm")} disabled={pending}>Confirm</Button>}
        <Button size="sm" variant="secondary" onClick={() => go("reject")} disabled={pending}>{status === "proposed" ? "Reject" : "Remove match"}</Button>
      </div>
      {error && <p role="alert" className="mt-1 max-w-xs text-xs text-danger">{error}</p>}
    </div>
  );
}
