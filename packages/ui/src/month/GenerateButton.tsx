"use client";
import { useState, useTransition } from "react";
import { Alert, Button } from "../components";
import { useApi, useNav } from "../context";
import { errorMessage } from "../errors";

export function GenerateButton({ month, adBankId, onChanged }: { month: string; adBankId: string; onChanged?: (() => void) | undefined }) {
  const api = useApi();
  const nav = useNav();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <Button
        disabled={pending}
        onClick={() => {
          setMsg(null);
          start(async () => {
            try {
              const r = await api.generatePack({ month, adBankId });
              if (r.ok) nav.push(nav.hrefs.pack(r.packId));
              else { setMsg("Something changed since this page loaded. The list above has been updated."); onChanged?.(); }
            } catch (e) {
              setMsg(errorMessage(e));
            }
          });
        }}
      >
        {pending ? "Generating..." : "Generate EDF pack"}
      </Button>
      {msg && <Alert tone="danger">{msg}</Alert>}
    </div>
  );
}
