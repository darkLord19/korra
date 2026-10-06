"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveBank, saveProfile } from "@korra/backend";
import { ownerCtx } from "@/server/ctx";
import { toFormState, type FormState } from "@/server/errors";
import { formValues, profileFromForm } from "@/server/forms";

const str = (d: FormData, k: string) => String(d.get(k) ?? "");

export async function saveBankAction(_prev: FormState, data: FormData): Promise<FormState> {
  try {
    const id = str(data, "id");
    await saveBank(await ownerCtx(), { ...(id ? { id } : {}), name: str(data, "name"), adCode: str(data, "adCode") });
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/onboarding");
  revalidatePath("/settings");
  return { ok: true };
}

export async function saveProfileAction(_prev: FormState, data: FormData): Promise<FormState> {
  try {
    await saveProfile(await ownerCtx(), profileFromForm(data));
  } catch (e) {
    return { ...toFormState(e), values: formValues(data) };
  }
  redirect("/");
}
