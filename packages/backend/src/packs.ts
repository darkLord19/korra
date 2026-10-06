import { assessPack } from "@korra/core";
import { newId } from "@korra/db";
import { listLayouts, renderPack } from "@korra/packs";
import type { Ctx } from "./deps";
import { NotFoundError, ValidationError } from "./errors";
import { generatePackInput, getPackDownloadsInput, markPackSubmittedInput } from "./inputs";
import { packWire, parse, repos, requireOwner } from "./internal";
import { draftFor, loadMonth } from "./month";
import type { GeneratePackResult, PackDownloadsWire, PackWire } from "./wire-types";

export const DOWNLOAD_TTL_SECONDS = 600;

/** Bank-specific layout when the bank name mentions icici/hdfc/axis, else the generic layout. */
export function layoutIdFor(bankName: string): string {
  const n = bankName.toLowerCase();
  for (const id of ["icici", "hdfc", "axis"]) if (n.includes(id)) return id;
  return "generic";
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
  const rendered = await renderPack(assessed.pack, layoutId, supporting);

  const packId = newId();
  const keys: string[] = [];
  const files = [];
  try {
    for (const f of rendered.files) {
      const blobKey = `u/${userId}/packs/${packId}/${f.name}`;
      await ctx.deps.blobs.put(blobKey, f.bytes, f.mimeType);
      keys.push(blobKey);
      files.push({ name: f.name, mimeType: f.mimeType, blobKey });
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
  const pack = await repos(ctx).packs.get(packId);
  const files = await Promise.all(
    pack.files.map(async (f) => ({ name: f.name, mimeType: f.mimeType, url: await ctx.deps.blobs.createDownloadUrl(f.blobKey, DOWNLOAD_TTL_SECONDS) })),
  );
  return { pack: packWire(pack), placeholder: isPlaceholder(pack.layoutId), files };
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
