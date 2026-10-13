"use client";
import { UploadPanel } from "../month/UploadPanel";

/** The optional bank acknowledgement (a receipt the bank gave back), stored with the pack's month. */
export function AckUpload({ month, onUploaded }: { month: string; onUploaded: (documentId: string) => void }) {
  return (
    <div>
      <p className="text-sm font-medium">Bank acknowledgement (optional)</p>
      <p className="mb-2 text-xs text-muted">If your bank gave you a receipt or acknowledgement, add it so you have it with the pack.</p>
      <UploadPanel month={month} showHint={false} defaultHint="ack" compact onUploaded={onUploaded} />
    </div>
  );
}
