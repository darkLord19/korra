"use server";
import { revalidatePath } from "next/cache";
import { deleteAccount, inviteCa, revokeCa } from "@korra/backend";
import { ownerCtx } from "@/server/ctx";
import { toFormState, type FormState } from "@/server/errors";
import { formValues } from "@/server/forms";

const str = (d: FormData, k: string) => String(d.get(k) ?? "");

export async function inviteCaAction(_prev: FormState, data: FormData): Promise<FormState> {
  try {
    await inviteCa(await ownerCtx(), str(data, "email"));
  } catch (e) {
    return { ...toFormState(e), values: formValues(data) };
  }
  revalidatePath("/settings");
  return { ok: true };
}

export async function revokeCaAction(shareId: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await revokeCa(await ownerCtx(), shareId);
  } catch (e) {
    return { ok: false, error: toFormState(e).error ?? "Something went wrong. Try again." };
  }
  revalidatePath("/settings");
  return { ok: true };
}

/** Deletes the account and everything in it. The caller then clears the browser session and leaves. */
export async function deleteAccountAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await deleteAccount(await ownerCtx());
  } catch (e) {
    return { ok: false, error: toFormState(e).error ?? "Something went wrong. Try again." };
  }
  return { ok: true };
}
