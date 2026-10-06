import { createRepos, type DocumentRecord, type PackRecord, type Repos } from "@korra/db";
import { proposeMatches } from "@korra/core";
import type { ZodType, z } from "zod";
import type { Ctx, Deps } from "./deps-types";
import { ForbiddenError, ValidationError } from "./errors";
import type { DocumentWire, PackWire } from "./wire-types";

export const reposFor = (deps: Deps, actor: Ctx["actor"]): Repos => createRepos(deps.db, actor, { now: deps.clock });
export const repos = (ctx: Ctx): Repos => reposFor(ctx.deps, ctx.actor);

export const todayOf = (deps: Deps): string => deps.clock().toISOString().slice(0, 10);

/** Parse with a use-case's input schema; failures surface as ValidationError. */
export function parse<S extends ZodType>(schema: S, value: unknown): z.output<S> {
  const r = schema.safeParse(value);
  if (!r.success) {
    throw new ValidationError(r.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; "));
  }
  return r.data;
}

/** Fail fast (before doing any work) for writes by a CA. The repositories enforce this too. */
export function requireOwner(ctx: Ctx): string {
  if (ctx.actor.role !== "owner") throw new ForbiddenError("read-only access");
  return ctx.actor.userId;
}

/**
 * Re-run the matcher over everything the user has and replace the *proposed* allocations.
 * Confirmed and rejected allocations are untouched (core + repo guarantee this).
 */
export async function rematch(r: Repos): Promise<void> {
  const [invoices, payments, existing] = await Promise.all([r.invoices.list(), r.payments.list(), r.allocations.list()]);
  const proposal = proposeMatches(invoices, payments, existing);
  await r.allocations.replaceProposed(
    proposal.allocations.filter((a) => a.status === "proposed"),
    { invoiceIds: invoices.map((i) => i.id) },
  );
}

export const documentWire = (d: DocumentRecord): DocumentWire => ({
  id: d.id,
  kind: d.kind,
  month: d.month,
  filename: d.filename,
  mimeType: d.mimeType,
  status: d.status,
  attempts: d.attempts,
  error: d.error,
  createdAt: d.createdAt.toISOString(),
});

export const packWire = (p: PackRecord): PackWire => ({
  id: p.id,
  month: p.month,
  adBankId: p.adBankId,
  layoutId: p.layoutId,
  status: p.status,
  files: p.files.map((f) => ({ name: f.name, mimeType: f.mimeType })),
  generatedAt: p.generatedAt.toISOString(),
  submittedAt: p.submittedAt ? p.submittedAt.toISOString() : null,
});
