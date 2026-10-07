import { headers } from "next/headers";
import { MAX_UPLOAD_BYTES, ValidationError, suggestProfileFromInvoice } from "@korra/backend";
import { getOwnerCtx } from "@korra/backend/server";
import { run } from "@/server/action-result";
import { getAuth } from "@/server/auth";
import { getDeps } from "@/server/deps";

export const dynamic = "force-dynamic";
export const maxDuration = 120; // Claude reading a PDF

const STATUS = { validation: 400, unauthenticated: 401, forbidden: 403, not_found: 404, unknown: 500 } as const;

/**
 * Onboarding's "fill this in from an invoice" (POST, multipart `file`): reads the invoice's issuer block and returns a
 * suggestion as `ActionResult<ProfileSuggestionWire>`. A route handler rather than a server action because a server
 * action's body is limited to 1 MB. Parse only: the file is not stored. Checks the session before reading the body;
 * the use-case checks the type (PDF or image) and the 20 MB limit again.
 */
export async function POST(req: Request): Promise<Response> {
  const result = await run(async () => {
    const ctx = await getOwnerCtx(await getDeps(), await headers(), await getAuth());
    if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) throw new ValidationError("Files are limited to 20 MB");
    const file = (await req.formData().catch(() => null))?.get("file");
    if (!(file instanceof File)) throw new ValidationError("Choose a file");
    return suggestProfileFromInvoice(ctx, { bytes: new Uint8Array(await file.arrayBuffer()), mimeType: file.type, filename: file.name });
  });
  return Response.json(result, { status: result.ok ? 200 : STATUS[result.error.kind] });
}
