"use server";
import { revalidatePath } from "next/cache";
import { markPackSubmitted } from "@korra/backend";
import { ownerCtx } from "@/server/ctx";
import { toFormState } from "@/server/errors";

export async function markSubmittedAction(packId: string, ackDocumentId?: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await markPackSubmitted(await ownerCtx(), { packId, ...(ackDocumentId ? { ackDocumentId } : {}) });
  } catch (e) {
    return { ok: false, error: toFormState(e).error ?? "Something went wrong. Try again." };
  }
  revalidatePath(`/packs/${packId}`);
  return { ok: true };
}
