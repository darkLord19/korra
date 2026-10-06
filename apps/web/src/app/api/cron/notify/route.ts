import { runDailyNotifications } from "@korra/backend";
import { isCronAuthorised, unauthorised } from "@/server/cron";
import { getDeps } from "@/server/deps";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** Vercel cron (GET): send the day's EDF and realisation reminders. */
export async function GET(req: Request): Promise<Response> {
  if (!isCronAuthorised(req)) return unauthorised();
  return Response.json(await runDailyNotifications(await getDeps()));
}
