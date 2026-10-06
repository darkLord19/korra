import type { ExporterProfile } from "@korra/core";
import type { Ctx } from "./deps-types";
import { NotFoundError } from "./errors";
import { parse, repos, requireOwner } from "./internal";
import { saveBankInput, saveProfileInput, type SaveBankInput, type SaveProfileInput } from "./inputs";
import type { AdBankWire, ExporterProfileWire, OnboardingWire } from "./wire-types";

export async function getOnboarding(ctx: Ctx): Promise<OnboardingWire> {
  const r = repos(ctx);
  const [profile, banks] = await Promise.all([r.profile.get(), r.banks.list()]);
  return { profile, banks, complete: profile !== null && banks.some((b) => b.id === profile.defaultAdBankId) };
}

export async function saveBank(ctx: Ctx, raw: SaveBankInput): Promise<AdBankWire> {
  requireOwner(ctx);
  const input = parse(saveBankInput, raw);
  return repos(ctx).banks.upsert(input);
}

export async function saveProfile(ctx: Ctx, raw: SaveProfileInput): Promise<ExporterProfileWire> {
  requireOwner(ctx);
  const input = parse(saveProfileInput, raw);
  const r = repos(ctx);
  const banks = await r.banks.list();
  if (!banks.some((b) => b.id === input.defaultAdBankId)) throw new NotFoundError("Default AD bank not found");
  const profile: ExporterProfile = { ...input, iec: input.iec ?? null };
  return r.profile.upsert(profile);
}
