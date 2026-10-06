import "server-only";

// Server-only entry (`@korra/backend/server`): real adapters (postgres, Supabase, Anthropic, Resend) and Better Auth.
export { createDeps } from "./deps";
export { envSchema, parseEnv } from "./env";
export type { Env } from "./env";
export { createResendMailer } from "./mailer-resend";
export { createConsoleMailer } from "./mailer";
export { createAuth, authFor, actorFromSession, getOwnerCtx, getCaCtx } from "./auth";
export type { Auth } from "./auth";
