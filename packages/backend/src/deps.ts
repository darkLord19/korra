import { createClaudeExtractor, createFakeExtractor, createIngester } from "@korra/ingest";
import { createDb, createSupabaseBlobStore } from "@korra/db";
import type { Deps } from "./deps-types";
import { parseEnv, type Env } from "./env";
import { createConsoleMailer, createResendMailer } from "./mailer";

// Types live in deps-types.ts (isomorphic); re-exported so existing imports keep working.
export type { Ctx, Deps, Ingester } from "./deps-types";

/** The real adapters. Tests build Deps with fakes (see `@korra/backend/testing`). */
export function createDeps(rawEnv: Env | Record<string, string | undefined>): Deps {
  const env = parseEnv(rawEnv as Record<string, string | undefined>);
  const llm = env.ANTHROPIC_API_KEY
    ? createClaudeExtractor({ apiKey: env.ANTHROPIC_API_KEY })
    : (console.warn("[korra] ANTHROPIC_API_KEY is not set: PDF/image extraction is disabled."),
      createFakeExtractor({}));
  const mailer = env.RESEND_API_KEY
    ? createResendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM })
    : (console.warn("[korra] RESEND_API_KEY is not set: emails are printed to the console."), createConsoleMailer());
  return {
    db: createDb(env.DATABASE_URL),
    blobs: createSupabaseBlobStore({ url: env.SUPABASE_URL, serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY, bucket: env.SUPABASE_BUCKET }),
    ingester: createIngester({ llm }),
    mailer,
    clock: () => new Date(),
    appUrl: env.APP_URL.replace(/\/+$/, ""),
    authSecret: env.BETTER_AUTH_SECRET,
    authUrl: env.BETTER_AUTH_URL,
  };
}
