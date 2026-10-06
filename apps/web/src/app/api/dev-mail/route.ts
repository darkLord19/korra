import { devMail, isDevInMemory } from "@/server/deps";

export const dynamic = "force-dynamic";

/** Dev-only (KORRA_DEV_INMEMORY=1, never in production): the most recent mails the app "sent", newest last. Used by the e2e test. */
export async function GET(req: Request): Promise<Response> {
  if (!isDevInMemory()) return new Response("Not found", { status: 404 });
  const n = Math.min(Math.max(Number(new URL(req.url).searchParams.get("n")) || 10, 1), 50);
  return Response.json(devMail().slice(-n));
}
