"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { BlockerWire } from "@korra/backend/schemas";
import { Alert, Button } from "@/components/ui";

export function GenerateButton({ month, adBankId, generate }: {
  month: string; adBankId: string;
  generate: (month: string, adBankId: string) => Promise<{ blockers: BlockerWire[] } | { error: string }>;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() => {
          setMsg(null);
          start(async () => {
            const r = await generate(month, adBankId); // redirects to /packs/[id] on success
            if (r && "error" in r) setMsg(r.error);
            else if (r && "blockers" in r) { setMsg("Something changed since this page loaded. The list above has been updated."); router.refresh(); }
          });
        }}
      >
        {pending ? "Generating..." : "Generate EDF pack"}
      </Button>
      {msg && <Alert tone="danger">{msg}</Alert>}
    </div>
  );
}
