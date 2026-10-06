import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s).digest();

/** True when the request carries `Authorization: Bearer ${CRON_SECRET}`. False when CRON_SECRET is unset. */
export function isCronAuthorised(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = req.headers.get("authorization") ?? "";
  // Hash both sides so the comparison is constant-time regardless of length.
  return timingSafeEqual(digest(given), digest(`Bearer ${secret}`));
}

export const unauthorised = () => new Response("Unauthorized", { status: 401 });
