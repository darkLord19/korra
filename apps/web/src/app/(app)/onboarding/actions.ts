"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { saveBank, saveProfile } from "@korra/backend";
import { ownerCtx } from "@/server/ctx";
import { toFormState, type FormState } from "@/server/errors";

const str = (d: FormData, k: string) => String(d.get(k) ?? "");

export async function saveBankAction(_prev: FormState, data: FormData): Promise<FormState> {
  try {
    const id = str(data, "id");
    await saveBank(await ownerCtx(), { ...(id ? { id } : {}), name: str(data, "name"), adCode: str(data, "adCode") });
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/onboarding");
  return { ok: true };
}

export async function saveProfileAction(_prev: FormState, data: FormData): Promise<FormState> {
  try {
    await saveProfile(await ownerCtx(), {
      legalName: str(data, "legalName"),
      address: str(data, "address"),
      pan: str(data, "pan"),
      gstin: str(data, "gstin"),
      iec: str(data, "iec") || null,
      defaultSacCodes: str(data, "defaultSacCodes").split(/[\s,]+/).filter(Boolean),
      defaultAdBankId: str(data, "defaultAdBankId"),
    });
  } catch (e) {
    return { ...toFormState(e), values: Object.fromEntries([...data.entries()].filter(([, v]) => typeof v === "string")) as Record<string, string> };
  }
  redirect("/");
}
