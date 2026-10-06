"use client";
import { useState, useTransition } from "react";
import { Button } from "../components";
import { useApi } from "../context";
import { errorMessage } from "../errors";

/** "I've checked these": marks every field of the invoice or payment as confirmed by the user (clears the "Check this" marks). */
export function ConfirmAllButton({ entity, id, label, onChanged }: { entity: "invoice" | "payment"; id: string; label: string; onChanged?: (() => void) | undefined }) {
  const api = useApi();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
      <Button
        size="sm"
        variant="secondary"
        disabled={pending}
        aria-label={`I've checked these (${label})`}
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              await api.confirmAllFields({ entity, id });
              onChanged?.();
            } catch (e) {
              setError(errorMessage(e));
            }
          });
        }}
      >
        {pending ? "Saving..." : "I’ve checked these"}
      </Button>
      {error && <p role="alert" className="mt-1 text-xs text-danger">{error}</p>}
    </div>
  );
}
