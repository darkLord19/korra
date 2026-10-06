import { toNextJsHandler } from "better-auth/next-js";
import { getAuth } from "@/server/auth";

export const dynamic = "force-dynamic";

type Handlers = ReturnType<typeof toNextJsHandler>;
const handler = (method: keyof Handlers) => async (req: Request) => toNextJsHandler(await getAuth())[method](req);

export const GET = handler("GET");
export const POST = handler("POST");
