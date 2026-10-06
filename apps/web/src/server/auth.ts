import "server-only";
import { createAuth, type Auth } from "@korra/backend/server";
import { nextCookies } from "better-auth/next-js";
import { getDeps } from "./deps";

const g = globalThis as unknown as { __korraAuth?: Promise<Auth> };

/** The Better Auth instance (lazy: built on first use, not at import time). */
export function getAuth(): Promise<Auth> {
  g.__korraAuth ??= getDeps().then((deps) => createAuth(deps, { plugins: [nextCookies()] }) as unknown as Auth);
  return g.__korraAuth;
}
