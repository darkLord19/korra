import { assessPack, edfDueDate, findCatalogBankInName, type Money } from "@korra/core";
import { newId } from "@korra/db";
import { getLayout, listLayouts, renderPack } from "@korra/packs";
import type { Ctx } from "./deps-types";
import { NotFoundError, ValidationError } from "./errors";
import { generatePackInput, getPackDownloadsInput, markPackSubmittedInput } from "./inputs";
import { packWire, parse, repos, requireOwner } from "./internal";
import { draftFor, loadMonth } from "./month";
import type { GeneratePackResult, MoneyWire, PackDownloadsWire, PackSummaryWire, PackWire, SubmissionWire } from "./wire-types";

export const DOWNLOAD_TTL_SECONDS = 600;

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function monthLabel(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTHS[Number(m) - 1] ?? m} ${y}`;
}

/** Bank-specific layout selected by catalog key, falling back to generic. */
export function layoutIdFor(bankName: string): string {
  return findCatalogBankInName(bankName)?.key ?? "generic";
}

/** True when the layout is a placeholder (bank format not collected yet): the UI warns before generating. */
export const isPlaceholderLayout = (layoutId: string): boolean => listLayouts().find((l) => l.id === layoutId)?.placeholder ?? false;
const isPlaceholder = isPlaceholderLayout;

export async function generatePack(ctx: Ctx, raw: { month: string; adBankId: string }): Promise<GeneratePackResult> {
  const userId = requireOwner(ctx);
  const input = parse(generatePackInput, raw);
  const r = repos(ctx);
  const m = await loadMonth(r, input.month);
  const bank = m.banks.find((b) => b.id === input.adBankId);
  if (!bank) throw new NotFoundError("AD bank not found");

  const draft = draftFor(m, bank);
  const assessed = assessPack(draft, ctx.deps.clock());
  if (!assessed.ok) return { ok: false, blockers: assessed.blockers };

  // Supporting documents: the invoice documents behind this pack's rows, plus the FIRA and NOC
  // documents of payments confirmed against those invoices. Statements are never included
  // (they list other clients' payments).
  const included = m.invoices.filter((i) => draft.invoices.some((d) => d.id === i.facts.id));
  const docIds = new Set<string>();
  for (const i of included) if (i.documentId) docIds.add(i.documentId);
  const [allocations, links, docs] = await Promise.all([r.allocations.list(), r.payments.links(), r.documents.list()]);
  const invIds = new Set(included.map((i) => i.facts.id));
  const docById = new Map(docs.map((d) => [d.id, d]));
  for (const a of allocations) {
    if (a.status !== "confirmed" || !invIds.has(a.invoiceId)) continue;
    const link = links[a.paymentId];
    if (link?.nocDocumentId) docIds.add(link.nocDocumentId);
    const src = link?.documentId ? docById.get(link.documentId) : undefined;
    if (src && src.kind === "fira") docIds.add(src.id);
  }
  const used = new Set<string>();
  const supporting: { name: string; bytes: Uint8Array }[] = [];
  for (const id of [...docIds].sort()) {
    const d = docById.get(id);
    if (!d) continue;
    let name = d.filename;
    for (let n = 2; used.has(name); n++) name = `${n}-${d.filename}`;
    used.add(name);
    supporting.push({ name, bytes: await ctx.deps.blobs.get(d.blobKey) });
  }

  const layoutId = layoutIdFor(bank.name);
  const signatureBytes = m.profile?.signatureBlobKey ? await ctx.deps.blobs.get(m.profile.signatureBlobKey).catch(() => undefined) : undefined;
  const sealBytes = m.profile?.sealBlobKey ? await ctx.deps.blobs.get(m.profile.sealBlobKey).catch(() => undefined) : undefined;
  const signatory = (m.profile?.signatoryName || m.profile?.signatoryDesignation)
    ? { name: m.profile.signatoryName ?? "", designation: m.profile.signatoryDesignation ?? "" }
    : undefined;
  const rendered = await renderPack(assessed.pack, layoutId, supporting, {
    signature: signatureBytes,
    seal: sealBytes,
    signatory,
  });

  const packId = newId();
  const keys: string[] = [];
  const files: { name: string; mimeType: string; blobKey: string; signed?: boolean }[] = [];
  try {
    for (const f of rendered.files) {
      const blobKey = `u/${userId}/packs/${packId}/${f.name}`;
      await ctx.deps.blobs.put(blobKey, f.bytes, f.mimeType);
      keys.push(blobKey);
      const isPdf = f.name.endsWith(".pdf");
      files.push({ name: f.name, mimeType: f.mimeType, blobKey, ...(isPdf && signatureBytes ? { signed: true } : {}) });
    }
    await r.packs.create({ id: packId, month: input.month, adBankId: bank.id, layoutId, files });
  } catch (e) {
    await ctx.deps.blobs.delete(keys).catch(() => undefined);
    throw e;
  }
  return { ok: true, packId, layoutId, placeholder: isPlaceholder(layoutId) };
}

export async function listPacks(ctx: Ctx, month?: string): Promise<PackWire[]> {
  return (await repos(ctx).packs.list(month)).map(packWire);
}

/** Signed download URLs (10 minutes). Works for a CA (read-only). */
export async function getPackDownloads(ctx: Ctx, rawId: string): Promise<PackDownloadsWire> {
  const packId = parse(getPackDownloadsInput, rawId);
  const r = repos(ctx);
  const pack = await r.packs.get(packId);
  const files = await Promise.all(
    pack.files.map(async (f) => ({ name: f.name, mimeType: f.mimeType, url: await ctx.deps.blobs.createDownloadUrl(f.blobKey, DOWNLOAD_TTL_SECONDS) })),
  );
  const signed = pack.files.some((f) => (f as { signed?: boolean }).signed === true);

  const [banks, profile, invoices] = await Promise.all([
    r.banks.list(),
    r.profile.get(),
    r.invoices.listForMonth(pack.month),
  ]);
  const bank = banks.find((b) => b.id === pack.adBankId) ?? null;

  const bankInvoices = invoices.filter(
    (i) => i.facts.adBankId.value === pack.adBankId || (!i.facts.adBankId.value && profile?.defaultAdBankId === pack.adBankId),
  );
  const totalsMap = new Map<string, bigint>();
  for (const inv of bankInvoices) {
    const amt = inv.facts.amount.value as Money | null;
    if (amt) {
      totalsMap.set(amt.currency, (totalsMap.get(amt.currency) ?? 0n) + amt.minor);
    }
  }
  const totals: MoneyWire[] = [...totalsMap.entries()].map(([currency, minor]) => ({
    currency,
    minor: minor.toString(),
  }));

  const summary: PackSummaryWire = {
    invoiceCount: bankInvoices.length,
    totals,
    exporterName: profile?.legalName ?? "",
    signatoryName: profile?.signatoryName ?? null,
  };

  let submission: SubmissionWire | null = null;
  let layout: ReturnType<typeof getLayout> | null = null;
  try {
    layout = getLayout(pack.layoutId);
  } catch {
    layout = null;
  }
  const sub = layout?.submission;
  if (sub) {
    const vars: Record<string, string> = {
      bank: bank?.name ?? "",
      month: monthLabel(pack.month),
      dueDate: edfDueDate(pack.month),
      adCode: bank?.adCode || "—",
      branch: bank?.branch || "your branch",
      contactEmail: bank?.contactEmail || "",
    };
    const replaceVars = (s: string) =>
      s.replace(/\{(bank|month|dueDate|adCode|branch|contactEmail)\}/g, (_, k: string) => vars[k] ?? "");

    submission = {
      documents: sub.documents.map(replaceVars),
      signing: {
        ...sub.signing,
        note: sub.signing.note ? replaceVars(sub.signing.note) : undefined,
      },
      channels: sub.channels.map((ch) => ({
        ...ch,
        title: replaceVars(ch.title),
        steps: ch.steps.map(replaceVars),
        links: ch.links,
      })),
      email: sub.email
        ? {
            subject: replaceVars(sub.email.subject),
            intro: replaceVars(sub.email.intro),
          }
        : undefined,
      sources: sub.sources,
    };
  }

  const [signatureUrl, sealUrl] = profile
    ? await Promise.all([
        profile.signatureBlobKey ? ctx.deps.blobs.createDownloadUrl(profile.signatureBlobKey, 3600).catch(() => null) : Promise.resolve(null),
        profile.sealBlobKey ? ctx.deps.blobs.createDownloadUrl(profile.sealBlobKey, 3600).catch(() => null) : Promise.resolve(null),
      ])
    : [null, null];

  return {
    pack: packWire(pack),
    placeholder: isPlaceholder(pack.layoutId),
    files,
    signed,
    submission,
    bank,
    summary,
    profile: profile ? { ...profile, signatureUrl, sealUrl } : null,
  };
}

export async function markPackSubmitted(ctx: Ctx, raw: { packId: string; ackDocumentId?: string }): Promise<PackWire> {
  requireOwner(ctx);
  const input = parse(markPackSubmittedInput, raw);
  const r = repos(ctx);
  if (input.ackDocumentId) {
    const ack = await r.documents.get(input.ackDocumentId); // NotFoundError unless it is this user's
    if (ack.kind !== "ack") throw new ValidationError("That file is not a bank acknowledgement.");
  }
  return packWire(await r.packs.markSubmitted(input.packId, input.ackDocumentId));
}
