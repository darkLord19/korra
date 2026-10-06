import { getDeps, isDevInMemory } from "@/server/deps";

export const dynamic = "force-dynamic";

/**
 * Dev-only stand-in for Supabase's signed upload URL (KORRA_DEV_INMEMORY=1, never in production).
 * Accepts the same request the browser sends to Supabase: a multipart PUT whose unnamed part is the
 * file (supabase-js `uploadToSignedUrl` shape), or a raw body.
 */
export async function PUT(req: Request): Promise<Response> {
  if (!isDevInMemory()) return new Response("Not found", { status: 404 });
  const token = new URL(req.url).searchParams.get("token");
  if (!token) return new Response("token required", { status: 400 });

  let bytes: Uint8Array;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("");
    if (!(file instanceof Blob)) return new Response("file part missing", { status: 400 });
    bytes = new Uint8Array(await file.arrayBuffer());
  } else {
    bytes = new Uint8Array(await req.arrayBuffer());
  }

  const deps = (await getDeps()) as unknown as { blobs: { completeUpload?: (t: string, b: Uint8Array) => void } };
  try {
    deps.blobs.completeUpload?.(token, bytes);
  } catch (e) {
    return new Response(e instanceof Error ? e.message : "upload failed", { status: 400 });
  }
  return Response.json({ Key: "dev" });
}

/** Dev-only download of a stored blob by key (stands in for Supabase signed download URLs). */
export async function GET(req: Request): Promise<Response> {
  if (!isDevInMemory()) return new Response("Not found", { status: 404 });
  const key = new URL(req.url).searchParams.get("key");
  if (!key) return new Response("key required", { status: 400 });
  const deps = await getDeps();
  try {
    const bytes = await deps.blobs.get(key);
    return new Response(Buffer.from(bytes), { headers: { "content-disposition": `attachment; filename="${key.split("/").pop()}"` } });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
