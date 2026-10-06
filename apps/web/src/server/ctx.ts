import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { UnauthenticatedError, type Ctx } from "@korra/backend";
import { getCaCtx, getOwnerCtx } from "@korra/backend/server";
import { getAuth } from "./auth";
import { getDeps } from "./deps";

/** Owner ctx for the signed-in user; redirects to /sign-in when there is no session. */
export async function ownerCtx(): Promise<Ctx> {
  try {
    return await getOwnerCtx(await getDeps(), await headers(), await getAuth());
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect("/sign-in");
    throw e;
  }
}

/** Read-only CA ctx for `ownerUserId`'s data (Stage 3b). The repositories verify the share. */
export async function caCtx(ownerUserId: string): Promise<Ctx> {
  try {
    return await getCaCtx(await getDeps(), await headers(), ownerUserId, await getAuth());
  } catch (e) {
    if (e instanceof UnauthenticatedError) redirect("/sign-in");
    throw e;
  }
}

/** Signed-in user's basic info for the shell, or null. */
export async function currentUser(): Promise<{ id: string; name: string; email: string } | null> {
  const session = await (await getAuth()).api.getSession({ headers: await headers() });
  return session ? { id: session.user.id, name: session.user.name, email: session.user.email } : null;
}
