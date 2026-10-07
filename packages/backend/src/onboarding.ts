import { GSTIN_RE, IFSC_RE, PAN_RE, findCatalogBankByIfsc, findCatalogBankInName, panFromGstin, type ExporterProfile, type Field } from "@korra/core";
import type { Ctx } from "./deps-types";
import { NotFoundError } from "./errors";
import { parse, repos, requireOwner } from "./internal";
import { saveBankInput, saveProfileInput, suggestProfileInput, type SaveBankInput, type SaveProfileInput } from "./inputs";
import type { AdBankWire, ExporterProfileWire, OnboardingWire, ProfileSuggestionWire } from "./wire-types";

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

const text = (f: Field<string> | undefined, max: number): string | null => f?.value?.trim().slice(0, max) || null;
const matching = (v: string | null, re: RegExp): string | null => (v && re.test(v.toUpperCase()) ? v.toUpperCase() : null);

/**
 * Reads the issuer (exporter) off one of the user's own invoices to pre-fill the profile form. Parse only: the file is
 * not stored, nothing is saved, and the user checks every value. In the web app the extractor is Claude (and returns
 * nothing when KORRA_LLM_ENABLED=false); in the browser app it is the on-device PDF reader, so nothing leaves the tab.
 * An unreadable file is not an error: every value comes back null.
 */
export async function suggestProfileFromInvoice(ctx: Ctx, file: { bytes: Uint8Array; mimeType: string; filename: string }): Promise<ProfileSuggestionWire> {
  requireOwner(ctx);
  const input = parse(suggestProfileInput, { filename: file.filename, mimeType: file.mimeType, sizeBytes: file.bytes.byteLength });
  const result = await ctx.deps.ingester.ingest({ bytes: file.bytes, mimeType: input.mimeType, filename: input.filename, hint: "invoice" });
  const i = result.issuer;
  const gstin = matching(text(i?.gstin, 15), GSTIN_RE);
  const ifsc = matching(text(i?.ifsc, 11), IFSC_RE);
  const bankName = text(i?.bankName, 80);
  const bank = (ifsc && findCatalogBankByIfsc(ifsc)) || (bankName && findCatalogBankInName(bankName)) || undefined;
  const date = result.invoices[0]?.invoiceDate.value;
  return {
    legalName: text(i?.legalName, 200),
    address: text(i?.address, 500),
    gstin,
    pan: (gstin && panFromGstin(gstin)) ?? matching(text(i?.pan, 10), PAN_RE),
    sacCode: matching(text(i?.sacCode, 8), /^\d{4,8}$/),
    bankKey: bank?.key ?? null,
    otherBankName: bank ? null : bankName,
    invoiceMonth: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 7) : null,
  };
}
