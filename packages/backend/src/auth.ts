import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { schema, type Actor } from "@korra/db";
import type { Ctx, Deps } from "./deps-types";
import { UnauthenticatedError } from "./errors";

/**
 * The Better Auth instance. Email + password with mandatory verification; verification and
 * reset emails go through deps.mailer. apps/web mounts it with `toNextJsHandler(auth)` and may pass
 * `plugins: [nextCookies()]` (kept out of here so backend does not depend on next).
 */
export function createAuth(deps: Deps, opts: { plugins?: BetterAuthPlugin[] } = {}) {
  const note = "If you did not ask for this, you can ignore this email.";
  return betterAuth({
    appName: "Korra",
    baseURL: deps.authUrl,
    secret: deps.authSecret,
    database: drizzleAdapter(deps.db, { provider: "pg", schema }),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      sendResetPassword: async ({ user, url }) => {
        await deps.mailer.send({
          to: user.email,
          subject: "Reset your Korra password",
          text: `Use this link to choose a new password:\n\n${url}\n\n${note}`,
        });
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user, url }) => {
        await deps.mailer.send({
          to: user.email,
          subject: "Verify your email for Korra",
          text: `Welcome to Korra. Confirm your email address with this link:\n\n${url}\n\n${note}`,
        });
      },
    },
    user: {
      additionalFields: { plan: { type: "string", defaultValue: "free", input: false } },
    },
    plugins: opts.plugins ?? [],
  });
}
export type Auth = ReturnType<typeof createAuth>;
type Session = NonNullable<Awaited<ReturnType<Auth["api"]["getSession"]>>>;

const cache = new WeakMap<Deps, Auth>();
/** One shared instance per Deps (used by getOwnerCtx / getCaCtx when no `auth` is passed). */
export function authFor(deps: Deps): Auth {
  let a = cache.get(deps);
  if (!a) cache.set(deps, (a = createAuth(deps)));
  return a;
}

export function actorFromSession(session: { user: { id: string } }): Actor {
  return { userId: session.user.id, role: "owner" };
}

async function requireSession(headers: Headers, auth: Auth): Promise<Session> {
  const session = await auth.api.getSession({ headers });
  if (!session) throw new UnauthenticatedError();
  return session;
}

/** Owner context for the signed-in user (also the right ctx for a CA acting on their own account). */
export async function getOwnerCtx(deps: Deps, headers: Headers, auth: Auth = authFor(deps)): Promise<Ctx> {
  const session = await requireSession(headers, auth);
  return { deps, actor: actorFromSession(session) };
}

/** CA context for viewing `ownerUserId`'s data. The repositories verify the accepted share on every call. */
export async function getCaCtx(deps: Deps, headers: Headers, ownerUserId: string, auth: Auth = authFor(deps)): Promise<Ctx> {
  const session = await requireSession(headers, auth);
  return { deps, actor: { userId: session.user.id, role: "ca", ownerUserId } };
}
