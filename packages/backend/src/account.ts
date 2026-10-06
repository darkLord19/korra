import type { Ctx } from "./deps-types";
import { repos, requireOwner } from "./internal";

/** Deletes the user and everything they own, then purges their blobs. Auth rows cascade with the user. */
export async function deleteAccount(ctx: Ctx): Promise<{ deletedBlobs: number }> {
  requireOwner(ctx);
  const keys = await repos(ctx).account.deleteAll();
  await ctx.deps.blobs.delete(keys);
  return { deletedBlobs: keys.length };
}
