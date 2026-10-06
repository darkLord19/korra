"use client";
import { useState, useTransition } from "react";
import { Alert, Button } from "../components";
import { useApi } from "../context";
import { errorMessage } from "../errors";
import { UploadPanel } from "../month/UploadPanel";

export function SubmitPanel({ packId, month, onChanged }: { packId: string; month: string; onChanged?: (() => void) | undefined }) {
  const api = useApi();
  const [ack, setAck] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Bank acknowledgement (optional)</p>
        <p className="mb-2 text-xs text-muted">If your bank gave you a receipt or acknowledgement, add it so you have it with the pack.</p>
        <UploadPanel month={month} showHint={false} defaultHint="ack" compact onUploaded={setAck} />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button
        disabled={pending}
        onClick={() => {
          setError(null);
          start(async () => {
            try {
              await api.markPackSubmitted({ packId, ...(ack ? { ackDocumentId: ack } : {}) });
              onChanged?.();
            } catch (e) {
              setError(errorMessage(e));
            }
          });
        }}
      >
        {pending ? "Saving..." : "Mark as submitted"}
      </Button>
    </div>
  );
}
