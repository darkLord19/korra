"use client";
import { useActionState } from "react";
import { Alert, Button } from "@/components/ui";
import type { FormState } from "@/lib/form-state";
import { acceptInviteAction } from "./actions";

export function AcceptForm({ token }: { token: string }) {
  const [state, action, pending] = useActionState(acceptInviteAction.bind(null, token), {} as FormState);
  return (
    <form action={action} className="space-y-3">
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Button type="submit" disabled={pending}>{pending ? "Accepting..." : "Accept"}</Button>
    </form>
  );
}
