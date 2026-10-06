import {
  assessPack,
  type AdBank,
  type ExporterProfile,
  type InvoiceFacts,
  type PackDraft,
} from "@korra/core";
import type { DocumentRecord, Repos } from "@korra/db";

export const EMPTY_PROFILE: ExporterProfile = {
  legalName: "",
  address: "",
  pan: "",
  gstin: "",
  iec: null,
  defaultSacCodes: [],
  defaultAdBankId: "",
};

export interface MonthContext {
  month: string;
  profile: ExporterProfile | null;
  banks: AdBank[];
  documents: DocumentRecord[];
  invoices: { facts: InvoiceFacts; documentId: string | null; undated: boolean }[];
  pendingDocumentIds: string[];
}

export async function loadMonth(r: Repos, month: string): Promise<MonthContext> {
  const [profile, banks, documents, invoices] = await Promise.all([
    r.profile.get(),
    r.banks.list(),
    r.documents.list(month),
    r.invoices.listForMonth(month),
  ]);
  const pendingDocumentIds = documents
    .filter((d) => (d.status === "uploaded" || d.status === "ingesting") && (d.kind === null || d.kind === "invoice" || d.kind === "unknown"))
    .map((d) => d.id);
  return { month, profile, banks, documents, invoices, pendingDocumentIds };
}

/** Invoices that belong in `bank`'s pack draft: dated in the month or undated (so they block), bank matching or unset. */
export function draftFor(ctx: MonthContext, bank: AdBank): PackDraft {
  return {
    month: ctx.month,
    adBank: bank,
    exporter: ctx.profile ?? EMPTY_PROFILE,
    invoices: ctx.invoices.map((i) => i.facts).filter((i) => i.adBankId.value === null || i.adBankId.value === bank.id),
    pendingDocumentIds: ctx.pendingDocumentIds,
  };
}

export function blockersByBank(ctx: MonthContext, now: Date) {
  const used = new Set(ctx.invoices.map((i) => i.facts.adBankId.value).filter((v): v is string => v !== null));
  const unassigned = ctx.invoices.some((i) => i.facts.adBankId.value === null);
  return ctx.banks
    .filter((b) => used.has(b.id) || b.id === ctx.profile?.defaultAdBankId || (unassigned && ctx.banks.length > 0))
    .map((bank) => {
      const res = assessPack(draftFor(ctx, bank), now);
      return { adBankId: bank.id, adBankName: bank.name, blockers: res.ok ? [] : res.blockers };
    });
}


