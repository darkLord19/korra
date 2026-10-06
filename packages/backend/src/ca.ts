import type { Ctx } from "./deps";
import { acceptCaInviteInput, getCaInviteInput, inviteCaInput, revokeCaInput } from "./inputs";
import { parse, repos, requireOwner } from "./internal";
import { toWire } from "./wire";
import type { CaClientWire, CaInviteWire, CaShareWire } from "./wire-types";

const shareWire = (s: { id: string; caEmail: string; status: CaShareWire["status"]; createdAt: Date; acceptedAt: Date | null }): CaShareWire =>
  toWire({ id: s.id, caEmail: s.caEmail, status: s.status, createdAt: s.createdAt, acceptedAt: s.acceptedAt });

/** Owner invites a CA by email; the CA gets a link to `${appUrl}/ca/accept?token=...`. */
export async function inviteCa(ctx: Ctx, rawEmail: string): Promise<CaShareWire> {
  requireOwner(ctx);
  const email = parse(inviteCaInput, rawEmail);
  const r = repos(ctx);
  const share = await r.shares.invite(email);
  if (share.status === "invited") {
    const name = (await r.profile.get())?.legalName ?? "A Korra user";
    const link = `${ctx.deps.appUrl}/ca/accept?token=${encodeURIComponent(share.token)}`;
    await ctx.deps.mailer.send({
      to: share.caEmail,
      subject: `${name} invited you to view their export records on Korra`,
      text: [
        `${name} has shared their export compliance records (EDF packs and realisation tracker) with you, read-only.`,
        `Sign in or create a Korra account with this email address, then accept:`,
        link,
        "",
        "If you do not know this person, you can ignore this email.",
      ].join("\n"),
    });
  }
  return shareWire(share);
}

/** Who sent an invite, and whether it is for the signed-in user. NotFoundError for an unknown token. */
export async function getCaInvite(ctx: Ctx, rawToken: string): Promise<CaInviteWire> {
  return repos(ctx).shares.peek(parse(getCaInviteInput, rawToken));
}

/** The caller is the invited CA, signed in as themselves. Sends nothing. */
export async function acceptCaInvite(ctx: Ctx, rawToken: string): Promise<{ shareId: string; ownerUserId: string }> {
  const token = parse(acceptCaInviteInput, rawToken);
  const share = await repos(ctx).shares.accept(token);
  return { shareId: share.id, ownerUserId: share.ownerUserId };
}

/** The CA's clients (owners who accepted and have not revoked). */
export async function listCaClients(ctx: Ctx): Promise<CaClientWire[]> {
  return toWire(await repos(ctx).shares.listForCa());
}

/** The owner's CAs (invited or accepted). Tokens are not returned. */
export async function listMyCas(ctx: Ctx): Promise<CaShareWire[]> {
  return (await repos(ctx).shares.listForOwner()).map(shareWire);
}

export async function revokeCa(ctx: Ctx, rawShareId: string): Promise<void> {
  requireOwner(ctx);
  await repos(ctx).shares.revoke(parse(revokeCaInput, rawShareId));
}
