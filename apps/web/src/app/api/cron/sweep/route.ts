import { sweepStuckIngests } from "@korra/backend";
import { isCronAuthorised, unauthorised } from "@/server/cron";
import { getDeps } from "@/server/deps";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Vercel cron (GET): re-run documents stuck while reading, fail the ones that ran out of attempts. */
export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorised(req)) return unauthorised();
  return Response.json(await sweepStuckIngests(await getDeps()));
}
