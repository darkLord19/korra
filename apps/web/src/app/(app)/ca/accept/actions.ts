"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptCaInvite } from "@korra/backend";
import { ownerCtx } from "@/server/ctx";
import { toFormState, type FormState } from "@/server/errors";

export async function acceptInviteAction(token: string, _prev: FormState): Promise<FormState> {
  try {
    await acceptCaInvite(await ownerCtx(), token);
  } catch (e) {
    return toFormState(e);
  }
  revalidatePath("/", "layout"); // the nav gains a "Clients" link
  redirect("/ca");
}
