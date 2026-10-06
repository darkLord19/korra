import { z } from "zod";

const optional = (s: z.ZodString) => z.preprocess((v) => (v === "" ? undefined : v), s.optional());

export const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  SUPABASE_BUCKET: z.string().min(1).default("documents"),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.url(),
  RESEND_API_KEY: optional(z.string()),
  MAIL_FROM: z.string().min(3).default("Korra <noreply@korra.app>"),
  ANTHROPIC_API_KEY: optional(z.string()),
  APP_URL: z.url(),
  CRON_SECRET: optional(z.string()),
});
export type Env = z.infer<typeof envSchema>;

/** Validates raw env (e.g. process.env). Throws a readable error naming every bad variable. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const r = envSchema.safeParse(raw);
  if (!r.success) {
    const lines = r.error.issues.map((i) => `  ${i.path.join(".")}: ${i.message}`);
    throw new Error(`Invalid environment:\n${lines.join("\n")}`);
  }
  return r.data;
}
