"use client";
import { useState, useTransition } from "react";
import { Button } from "../components";
import { useApi } from "../context";
import { errorMessage } from "../errors";

export function MatchButtons({ invoiceId, paymentId, status, onChanged }: {
  invoiceId: string; paymentId: string; status: "proposed" | "confirmed"; onChanged?: (() => void) | undefined;
}) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const go = (decision: "confirm" | "reject") => {
    setError(null);
    start(async () => {
      try {
        await api.decideAllocation({ invoiceId, paymentId, decision });
        onChanged?.();
      } catch (e) {
        setError(errorMessage(e));
      }
    });
  };
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
