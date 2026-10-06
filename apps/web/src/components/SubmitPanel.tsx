"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button } from "@/components/ui";
import { UploadPanel } from "@/components/month/UploadPanel";

type Up = Parameters<typeof UploadPanel>[0];

export function SubmitPanel({ packId, month, requestUploadAction, confirmUploadAction, markSubmitted }: {
  packId: string; month: string;
  requestUploadAction: Up["requestUploadAction"]; confirmUploadAction: Up["confirmUploadAction"];
  markSubmitted: (packId: string, ackDocumentId?: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [ack, setAck] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-medium">Bank acknowledgement (optional)</p>
        <p className="mb-2 text-xs text-muted">If your bank gave you a receipt or acknowledgement, add it so you have it with the pack.</p>
        <UploadPanel month={month} showHint={false} compact requestUploadAction={requestUploadAction} confirmUploadAction={confirmUploadAction} onUploaded={setAck} />
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      <Button disabled={pending} onClick={() => { setError(null); start(async () => { const r = await markSubmitted(packId, ack); if (r.ok) router.refresh(); else setError(r.error); }); }}>
        {pending ? "Saving..." : "Mark as submitted"}
      </Button>
    </div>
  );
}
