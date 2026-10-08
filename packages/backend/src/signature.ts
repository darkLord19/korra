import type { Ctx } from "./deps-types";
import { NotFoundError } from "./errors";
import { saveSignatureInput, type SaveSignatureInput } from "./inputs";
import { parse, repos, requireOwner } from "./internal";
import type { ExporterProfileWire } from "./wire-types";

export function parseBase64OrDataUrl(data: string): Uint8Array {
  const commaIdx = data.indexOf(",");
  const base64Str = commaIdx !== -1 ? data.slice(commaIdx + 1) : data;
  const cleaned = base64Str.replace(/\s+/g, "");
  if (typeof Buffer !== "undefined") {
    return new Uint8Array(Buffer.from(cleaned, "base64"));
  }
  const binary = atob(cleaned);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function saveSignature(ctx: Ctx, raw: SaveSignatureInput): Promise<ExporterProfileWire> {
  const userId = requireOwner(ctx);
  const input = parse(saveSignatureInput, raw);
  const r = repos(ctx);
  const profile = await r.profile.get();
  if (!profile) throw new NotFoundError("Profile not found");

  let signatureBlobKey = profile.signatureBlobKey ?? null;
  let sealBlobKey = profile.sealBlobKey ?? null;

  if (input.signatureBase64 !== undefined) {
    if (input.signatureBase64) {
      const bytes = parseBase64OrDataUrl(input.signatureBase64);
      const key = `u/${userId}/profile/signature.png`;
      await ctx.deps.blobs.put(key, bytes, "image/png");
      signatureBlobKey = key;
    } else {
      if (signatureBlobKey) {
        await ctx.deps.blobs.delete([signatureBlobKey]).catch(() => undefined);
      }
      signatureBlobKey = null;
    }
  }

  if (input.sealBase64 !== undefined) {
    if (input.sealBase64) {
      const bytes = parseBase64OrDataUrl(input.sealBase64);
      const key = `u/${userId}/profile/seal.png`;
      await ctx.deps.blobs.put(key, bytes, "image/png");
      sealBlobKey = key;
    } else {
      if (sealBlobKey) {
        await ctx.deps.blobs.delete([sealBlobKey]).catch(() => undefined);
      }
      sealBlobKey = null;
    }
  }

  const updatedProfile = {
    ...profile,
    signatoryName: input.signatoryName !== undefined ? (input.signatoryName?.trim() || null) : (profile.signatoryName ?? null),
    signatoryDesignation: input.signatoryDesignation !== undefined ? (input.signatoryDesignation?.trim() || null) : (profile.signatoryDesignation ?? null),
    signatureBlobKey,
    sealBlobKey,
  };

  await r.profile.upsert(updatedProfile);

  const [signatureUrl, sealUrl] = await Promise.all([
    signatureBlobKey ? ctx.deps.blobs.createDownloadUrl(signatureBlobKey, 3600).catch(() => null) : Promise.resolve(null),
    sealBlobKey ? ctx.deps.blobs.createDownloadUrl(sealBlobKey, 3600).catch(() => null) : Promise.resolve(null),
  ]);

  return {
    ...updatedProfile,
    signatureUrl,
    sealUrl,
  };
}

export async function clearSignature(ctx: Ctx): Promise<ExporterProfileWire> {
  requireOwner(ctx);
  const r = repos(ctx);
  const profile = await r.profile.get();
  if (!profile) throw new NotFoundError("Profile not found");

  const toDelete = [profile.signatureBlobKey, profile.sealBlobKey].filter(Boolean) as string[];
  if (toDelete.length) {
    await ctx.deps.blobs.delete(toDelete).catch(() => undefined);
  }

  const updatedProfile = {
    ...profile,
    signatoryName: null,
    signatoryDesignation: null,
    signatureBlobKey: null,
    sealBlobKey: null,
  };

  await r.profile.upsert(updatedProfile);

  return {
    ...updatedProfile,
    signatureUrl: null,
    sealUrl: null,
  };
}
