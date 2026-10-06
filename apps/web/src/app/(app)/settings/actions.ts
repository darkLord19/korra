"use server";
import { revalidatePath } from "next/cache";
import { deleteAccount, inviteCa, revokeCa, saveBank, saveProfile } from "@korra/backend";
import { ownerCtx } from "@/server/ctx";
import { toFormState, type FormState } from "@/server/errors";
import { formValues, profileFromForm } from "@/server/forms";

const str = (d: FormData, k: string) => String(d.get(k) ?? "");

export async function updateBankAction(_prev: FormState, data: FormData): Promise<FormState> {
  try {
    await saveBank(await ownerCtx(), { id: str(data, "id"), name: str(data, "name"), adCode: str(data, "adCode") });
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveProfileSettingsAction(_prev: FormState, data: FormData): Promise<FormState> {
  try {
    await saveProfile(await ownerCtx(), profileFromForm(data));
  } catch (e) {
    return { ...toFormState(e), values: formValues(data) };
  }
  revalidatePath("/settings");
  return { ok: true };
}

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
