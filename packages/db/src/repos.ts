import { randomBytes, randomUUID } from "node:crypto";
import type {
  Allocation,
  AdBank,
  ExporterProfile,
  Field,
  InvoiceFacts,
  PaymentFacts,
  YearMonth,
} from "@korra/core";
import { and, asc, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { blobKeyFor } from "./blob";
import type { Db } from "./db";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import {
  INVOICE_FIELDS,
  PAYMENT_FIELDS,
  allocationFromRow,
  fromStoredField,
  invoiceColumn,
  invoiceFromRow,
  invoiceToColumns,
  monthOf,
  paymentFromRow,
  paymentToColumns,
  toStoredField,
  type FieldValue,
  type InvoiceFieldName,
  type PaymentFieldName,
} from "./mapping";
import * as s from "./schema";

export type Actor =
  | { userId: string; role: "owner" }
  | { userId: string; role: "ca"; ownerUserId: string };

export interface RepoOptions {
  /** Clock, for deterministic tests. */
  now?: () => Date;
}

export type DocumentKind = NonNullable<typeof s.document.$inferSelect.kind>;
export type DocumentStatus = typeof s.document.$inferSelect.status;
export type DocumentRecord = typeof s.document.$inferSelect;
export type PackRecord = typeof s.pack.$inferSelect;
export type PackFile = { name: string; mimeType: string; blobKey: string };
export type CaShareRecord = typeof s.caShare.$inferSelect;

export const newId = () => randomUUID();

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Q = Db | Tx;

export function createRepos(db: Db, actor: Actor, opts: RepoOptions = {}) {
  const now = opts.now ?? (() => new Date());

  /** Owner whose data this actor may READ. A CA is re-verified against ca_share on every call. */
  async function readOwner(): Promise<string> {
    if (actor.role === "owner") return actor.userId;
    const rows = await db
      .select({ id: s.caShare.id })
      .from(s.caShare)
      .where(
        and(
          eq(s.caShare.ownerUserId, actor.ownerUserId),
          eq(s.caShare.caUserId, actor.userId),
          eq(s.caShare.status, "accepted"),
        ),
      )
      .limit(1);
    if (rows.length === 0) throw new NotFoundError();
    return actor.ownerUserId;
  }

  /** Owner whose data this actor may WRITE. CAs never write. */
  function writeOwner(): string {
    if (actor.role !== "owner") throw new ForbiddenError("read-only access");
    return actor.userId;
  }

  const one = <T>(rows: T[]): T => {
    const r = rows[0];
    if (r === undefined) throw new NotFoundError();
    return r;
  };

  async function assertOwnsDocument(q: Q, userId: string, documentId: string) {
    const r = await q
      .select({ id: s.document.id })
      .from(s.document)
      .where(and(eq(s.document.id, documentId), eq(s.document.userId, userId)));
    one(r);
  }

  /* ------------------------------ profile ------------------------------ */
  const profile = {
    async get(): Promise<ExporterProfile | null> {
      const uid = await readOwner();
      const r = (await db.select().from(s.exporterProfile).where(eq(s.exporterProfile.userId, uid)))[0];
      if (!r) return null;
      return {
        legalName: r.legalName,
        address: r.address,
        pan: r.pan,
        gstin: r.gstin,
        iec: r.iec,
        defaultSacCodes: r.defaultSacCodes,
        defaultAdBankId: r.defaultAdBankId,
      };
    },
    async upsert(p: ExporterProfile): Promise<ExporterProfile> {
      const uid = writeOwner();
      const values = { ...p, userId: uid, updatedAt: now() };
      await db.insert(s.exporterProfile).values(values).onConflictDoUpdate({ target: s.exporterProfile.userId, set: values });
      return p;
    },
  };

  /* ------------------------------- banks ------------------------------- */
  const banks = {
    async list(): Promise<AdBank[]> {
      const uid = await readOwner();
      const rows = await db.select().from(s.adBank).where(eq(s.adBank.userId, uid)).orderBy(asc(s.adBank.createdAt), asc(s.adBank.id));
      return rows.map((r) => ({ id: r.id, name: r.name, adCode: r.adCode }));
    },
    async upsert(b: { id?: string; name: string; adCode: string }): Promise<AdBank> {
      const uid = writeOwner();
      const id = b.id ?? newId();
      if (b.id) {
        const existing = (await db.select({ userId: s.adBank.userId }).from(s.adBank).where(eq(s.adBank.id, id)))[0];
        if (existing && existing.userId !== uid) throw new NotFoundError();
      }
      await db
        .insert(s.adBank)
        .values({ id, userId: uid, name: b.name, adCode: b.adCode })
        .onConflictDoUpdate({ target: s.adBank.id, set: { name: b.name, adCode: b.adCode } });
      return { id, name: b.name, adCode: b.adCode };
    },
  };

  /* ----------------------------- documents ----------------------------- */
  const documents = {
    /** `id` and `blobKey` default to a fresh id and `u/{userId}/{documentId}/{filename}`. */
    async create(d: {
      id?: string;
      filename: string;
      mimeType: string;
      kind?: DocumentKind | null;
      month?: YearMonth | null;
      blobKey?: string;
    }): Promise<DocumentRecord> {
      const uid = writeOwner();
      const id = d.id ?? newId();
      const t = now();
      const [row] = await db
        .insert(s.document)
        .values({
          id,
          userId: uid,
          kind: d.kind ?? null,
          month: d.month ?? null,
          filename: d.filename,
          mimeType: d.mimeType,
          blobKey: d.blobKey ?? blobKeyFor(uid, id, d.filename),
          statusChangedAt: t,
          createdAt: t,
        })
        .returning();
      return row!;
    },
    async get(id: string): Promise<DocumentRecord> {
      const uid = await readOwner();
      return one(await db.select().from(s.document).where(and(eq(s.document.id, id), eq(s.document.userId, uid))));
    },
    async list(month?: YearMonth): Promise<DocumentRecord[]> {
      const uid = await readOwner();
      return db
        .select()
        .from(s.document)
        .where(and(eq(s.document.userId, uid), month ? eq(s.document.month, month) : undefined))
        .orderBy(asc(s.document.createdAt), asc(s.document.id));
    },
    /** Entering "ingesting" counts as an attempt (the sweep gives up after N). */
    async setStatus(id: string, status: DocumentStatus, error?: string): Promise<DocumentRecord> {
      const uid = writeOwner();
      const cur = one(await db.select().from(s.document).where(and(eq(s.document.id, id), eq(s.document.userId, uid))));
      const [row] = await db
        .update(s.document)
        .set({
          status,
          error: error ?? null,
          statusChangedAt: now(),
          attempts: status === "ingesting" ? cur.attempts + 1 : cur.attempts,
        })
        .where(eq(s.document.id, id))
        .returning();
      return row!;
    },
    /**
     * Owner-scoped, atomic re-queue of THIS user's documents stuck `ingesting` since before `olderThan`.
     * Those with attempts left go back to `ingesting` (attempt +1, stuck timer restarted) and their ids are
     * returned; the exhausted ones are marked `failed`. Because the timer restarts in the same UPDATE,
     * concurrent callers never re-queue the same document twice.
     */
    async requeueStuck(olderThan: Date, maxAttempts: number): Promise<{ requeued: string[]; failed: number }> {
      const uid = writeOwner();
      const t = now();
      const stale = and(eq(s.document.userId, uid), eq(s.document.status, "ingesting"), lt(s.document.statusChangedAt, olderThan));
      return db.transaction(async (tx) => {
        const failed = await tx
          .update(s.document)
          .set({ status: "failed", error: `Ingest gave up after ${maxAttempts} attempts`, statusChangedAt: t })
          .where(and(stale, sql`${s.document.attempts} >= ${maxAttempts}`))
          .returning({ id: s.document.id });
        const requeued = await tx
          .update(s.document)
          .set({ error: null, statusChangedAt: t, attempts: sql`${s.document.attempts} + 1` })
          .where(and(stale, lt(s.document.attempts, maxAttempts)))
          .returning({ id: s.document.id });
        return { requeued: requeued.map((r) => r.id), failed: failed.length };
      });
    },
    /**
     * Idempotent re-ingest support: deletes the invoices and payments extracted from this document
     * (their proposed allocations cascade). Refuses with ValidationError when the user has already
     * worked on any of them (a field edit, or a confirmed/rejected allocation), so edits are never lost.
     */
    async deleteExtracted(documentId: string): Promise<{ invoices: number; payments: number }> {
      const uid = writeOwner();
      return db.transaction(async (tx) => {
        await assertOwnsDocument(tx, uid, documentId);
        const inv = await tx.select({ id: s.invoice.id }).from(s.invoice).where(and(eq(s.invoice.userId, uid), eq(s.invoice.documentId, documentId)));
        const pay = await tx.select({ id: s.payment.id }).from(s.payment).where(and(eq(s.payment.userId, uid), eq(s.payment.documentId, documentId)));
        const invIds = inv.map((r) => r.id);
        const payIds = pay.map((r) => r.id);
        const entityIds = [...invIds, ...payIds];
        if (entityIds.length === 0) return { invoices: 0, payments: 0 };
        const edited = await tx.select({ id: s.fieldEdit.id }).from(s.fieldEdit).where(inArray(s.fieldEdit.entityId, entityIds)).limit(1);
        const decided = await tx
          .select({ id: s.allocation.invoiceId })
          .from(s.allocation)
          .where(
            and(
              ne(s.allocation.status, "proposed"),
              or(invIds.length ? inArray(s.allocation.invoiceId, invIds) : undefined, payIds.length ? inArray(s.allocation.paymentId, payIds) : undefined),
            ),
          )
          .limit(1);
        if (edited.length || decided.length) {
          throw new ValidationError("This document's records have been edited or matched; they were kept. Delete the records first or re-upload as a new document.");
        }
        if (invIds.length) await tx.delete(s.invoice).where(inArray(s.invoice.id, invIds));
        if (payIds.length) await tx.delete(s.payment).where(inArray(s.payment.id, payIds));
        return { invoices: invIds.length, payments: payIds.length };
      });
    },
    /** Record what ingest decided this document is (and optionally its month). */
    async setKind(id: string, kind: DocumentKind, month?: YearMonth | null): Promise<DocumentRecord> {
      const uid = writeOwner();
      one(await db.select({ id: s.document.id }).from(s.document).where(and(eq(s.document.id, id), eq(s.document.userId, uid))));
      const [row] = await db
        .update(s.document)
        .set(month === undefined ? { kind } : { kind, month })
        .where(eq(s.document.id, id))
        .returning();
      return row!;
    },
  };

  /* --------------------- invoices & payments (shared) --------------------- */

  async function auditedUpdate(
    entity: "invoice" | "payment",
    id: string,
    column: string,
    factField: string,
    value: unknown,
  ) {
    const uid = writeOwner();
    const table = entity === "invoice" ? s.invoice : s.payment;
    return db.transaction(async (tx) => {
      const row = one(await tx.select().from(table).where(and(eq(table.id, id), eq(table.userId, uid)))) as unknown as Record<string, unknown>;
      const old = row[column] as s.StoredField;
      const next = toStoredField(factField, { value, confidence: 1, source: "user" });
      const set: Record<string, unknown> = { [column]: next };
      if (entity === "invoice" && factField === "invoiceDate") set.month = monthOf(value);
      if (entity === "invoice" && factField === "adBankId") set.adBankId = typeof value === "string" ? value : null;
      if (entity === "payment" && factField === "date") set.month = monthOf(value);
      const [updated] = await tx.update(table).set(set).where(eq(table.id, id)).returning();
      await tx.insert(s.fieldEdit).values({
        id: newId(),
        userId: uid,
        actorUserId: actor.userId,
        entity,
        entityId: id,
        field: factField,
        old,
        new: next,
        at: now(),
      });
      return updated as never;
    });
  }

  /* ------------------------------ invoices ------------------------------ */
  const invoices = {
    async get(id: string): Promise<InvoiceFacts> {
      const uid = await readOwner();
      return invoiceFromRow(one(await db.select().from(s.invoice).where(and(eq(s.invoice.id, id), eq(s.invoice.userId, uid)))));
    },
    async list(): Promise<InvoiceFacts[]> {
      const uid = await readOwner();
      const rows = await db.select().from(s.invoice).where(eq(s.invoice.userId, uid)).orderBy(asc(s.invoice.createdAt), asc(s.invoice.id));
      return rows.map(invoiceFromRow);
    },
    async listByMonth(month: YearMonth, o: { adBankId?: string } = {}): Promise<InvoiceFacts[]> {
      const uid = await readOwner();
      const rows = await db
        .select()
        .from(s.invoice)
        .where(
          and(
            eq(s.invoice.userId, uid),
            eq(s.invoice.month, month),
            o.adBankId ? eq(s.invoice.adBankId, o.adBankId) : undefined,
          ),
        )
        .orderBy(asc(s.invoice.createdAt), asc(s.invoice.id));
      return rows.map(invoiceFromRow);
    },
    /**
     * Invoices of a month: those dated in it, plus undated ones extracted from a document filed under
     * that month (so they can block a pack instead of vanishing). Includes each invoice's source document id.
     */
    async listForMonth(month: YearMonth): Promise<{ facts: InvoiceFacts; documentId: string | null; undated: boolean }[]> {
      const uid = await readOwner();
      const rows = await db
        .select({ inv: s.invoice })
        .from(s.invoice)
        .leftJoin(s.document, eq(s.document.id, s.invoice.documentId))
        .where(and(eq(s.invoice.userId, uid), or(eq(s.invoice.month, month), and(isNull(s.invoice.month), eq(s.document.month, month)))))
        .orderBy(asc(s.invoice.createdAt), asc(s.invoice.id));
      return rows.map(({ inv }) => ({ facts: invoiceFromRow(inv), documentId: inv.documentId, undated: inv.month === null }));
    },
    /** `documentId` may be null (manually created). Month and ad_bank_id are derived from the field values. */
    async insertExtracted(documentId: string | null, facts: Omit<InvoiceFacts, "id">[]): Promise<string[]> {
      const uid = writeOwner();
      if (documentId) await assertOwnsDocument(db, uid, documentId);
      if (facts.length === 0) return [];
      const rows = facts.map((fa) => ({
        id: newId(),
        userId: uid,
        documentId,
        month: monthOf(fa.invoiceDate.value),
        adBankId: fa.adBankId.value,
        ...invoiceToColumns(fa),
      }));
      await db.insert(s.invoice).values(rows as (typeof s.invoice.$inferInsert)[]);
      return rows.map((r) => r.id);
    },
    /** Sets {value, confidence: 1, source: "user"} and writes the field_edit row in one transaction. */
    async updateField<K extends InvoiceFieldName>(id: string, field: K, value: FieldValue<InvoiceFacts[K]>): Promise<InvoiceFacts> {
      if (!(INVOICE_FIELDS as readonly string[]).includes(field)) throw new ValidationError(`unknown invoice field: ${field}`);
      const row = await auditedUpdate("invoice", id, invoiceColumn(field), field, value);
      return invoiceFromRow(row);
    },
  };

  /* ------------------------------ payments ------------------------------ */
  const payments = {
    async get(id: string): Promise<PaymentFacts> {
      const uid = await readOwner();
      return paymentFromRow(one(await db.select().from(s.payment).where(and(eq(s.payment.id, id), eq(s.payment.userId, uid)))));
    },
    async list(): Promise<PaymentFacts[]> {
      const uid = await readOwner();
      const rows = await db.select().from(s.payment).where(eq(s.payment.userId, uid)).orderBy(asc(s.payment.createdAt), asc(s.payment.id));
      return rows.map(paymentFromRow);
    },
    async listByMonth(month: YearMonth): Promise<PaymentFacts[]> {
      const uid = await readOwner();
      const rows = await db
        .select()
        .from(s.payment)
        .where(and(eq(s.payment.userId, uid), eq(s.payment.month, month)))
        .orderBy(asc(s.payment.createdAt), asc(s.payment.id));
      return rows.map(paymentFromRow);
    },
    async insertExtracted(documentId: string | null, facts: Omit<PaymentFacts, "id">[]): Promise<string[]> {
      const uid = writeOwner();
      if (documentId) await assertOwnsDocument(db, uid, documentId);
      if (facts.length === 0) return [];
      const rows = facts.map((fa) => ({
        id: newId(),
        userId: uid,
        documentId,
        rail: fa.rail,
        month: monthOf(fa.date.value),
        ...paymentToColumns(fa),
      }));
      await db.insert(s.payment).values(rows as (typeof s.payment.$inferInsert)[]);
      return rows.map((r) => r.id);
    },
    async updateField<K extends PaymentFieldName>(id: string, field: K, value: FieldValue<PaymentFacts[K]>): Promise<PaymentFacts> {
      if (!(PAYMENT_FIELDS as readonly string[]).includes(field)) throw new ValidationError(`unknown payment field: ${field}`);
      return paymentFromRow(await auditedUpdate("payment", id, field, field, value));
    },
    /** Source document and linked NOC document of every payment, by payment id. */
    async links(): Promise<Record<string, { documentId: string | null; nocDocumentId: string | null }>> {
      const uid = await readOwner();
      const rows = await db
        .select({ id: s.payment.id, documentId: s.payment.documentId, nocDocumentId: s.payment.nocDocumentId })
        .from(s.payment)
        .where(eq(s.payment.userId, uid));
      return Object.fromEntries(rows.map((r) => [r.id, { documentId: r.documentId, nocDocumentId: r.nocDocumentId }]));
    },
    async linkNoc(paymentId: string, documentId: string): Promise<void> {
      const uid = writeOwner();
      await assertOwnsDocument(db, uid, documentId);
      const r = await db
        .update(s.payment)
        .set({ nocDocumentId: documentId })
        .where(and(eq(s.payment.id, paymentId), eq(s.payment.userId, uid)))
        .returning({ id: s.payment.id });
      one(r);
    },
    /**
     * Merge FIRA-derived fields into an existing payment. A field is replaced only when the
     * incoming value is non-null AND the existing value is null, or is not user-set and has lower
     * confidence. User-edited fields are never overwritten. System merges are NOT written to
     * field_edit (that log records human edits; the source document is the provenance).
     */
    async mergeFira(
      paymentId: string,
      fira: Partial<Omit<PaymentFacts, "id" | "rail">>,
    ): Promise<PaymentFacts> {
      const uid = writeOwner();
      return db.transaction(async (tx) => {
        const row = one(await tx.select().from(s.payment).where(and(eq(s.payment.id, paymentId), eq(s.payment.userId, uid))));
        const set: Record<string, unknown> = {};
        for (const name of PAYMENT_FIELDS) {
          const inc = fira[name] as Field<unknown> | undefined;
          if (!inc || inc.value === null) continue;
          const cur = fromStoredField(name, row[name]);
          const replace =
            cur.value === null || (cur.source !== "user" && inc.confidence > cur.confidence);
          if (replace) set[name] = toStoredField(name, inc);
        }
        if (set.date) set.month = monthOf((set.date as s.StoredField).value);
        if (Object.keys(set).length === 0) return paymentFromRow(row);
        const [u] = await tx.update(s.payment).set(set).where(eq(s.payment.id, paymentId)).returning();
        return paymentFromRow(u!);
      });
    },
  };

  /* ---------------------------- allocations ---------------------------- */
  const allocations = {
    async list(month?: YearMonth): Promise<Allocation[]> {
      const uid = await readOwner();
      if (!month) {
        const rows = await db.select().from(s.allocation).where(eq(s.allocation.userId, uid)).orderBy(asc(s.allocation.invoiceId), asc(s.allocation.paymentId));
        return rows.map(allocationFromRow);
      }
      const rows = await db
        .select({ a: s.allocation })
        .from(s.allocation)
        .innerJoin(s.invoice, eq(s.invoice.id, s.allocation.invoiceId))
        .where(and(eq(s.allocation.userId, uid), eq(s.invoice.month, month)))
        .orderBy(asc(s.allocation.invoiceId), asc(s.allocation.paymentId));
      return rows.map((r) => allocationFromRow(r.a));
    },
    /**
     * Deletes existing *proposed* allocations of the invoices involved (plus `opts.invoiceIds`, for
     * invoices that now have no proposals) and inserts the incoming *proposed* ones. Confirmed and
     * rejected rows are never touched; incoming rows that are not "proposed" are ignored, and an
     * incoming proposal for a pair that already has a confirmed/rejected row is dropped.
     */
    async replaceProposed(incoming: Allocation[], opts: { invoiceIds?: string[] } = {}): Promise<void> {
      const uid = writeOwner();
      const invoiceIds = [...new Set([...incoming.map((a) => a.invoiceId), ...(opts.invoiceIds ?? [])])];
      const paymentIds = [...new Set(incoming.map((a) => a.paymentId))];
      await db.transaction(async (tx) => {
        if (invoiceIds.length) {
          const own = await tx.select({ id: s.invoice.id }).from(s.invoice).where(and(eq(s.invoice.userId, uid), inArray(s.invoice.id, invoiceIds)));
          if (own.length !== invoiceIds.length) throw new NotFoundError();
        }
        if (paymentIds.length) {
          const own = await tx.select({ id: s.payment.id }).from(s.payment).where(and(eq(s.payment.userId, uid), inArray(s.payment.id, paymentIds)));
          if (own.length !== paymentIds.length) throw new NotFoundError();
        }
        if (invoiceIds.length) {
          await tx
            .delete(s.allocation)
            .where(and(eq(s.allocation.userId, uid), eq(s.allocation.status, "proposed"), inArray(s.allocation.invoiceId, invoiceIds)));
        }
        const proposals = incoming.filter((a) => a.status === "proposed");
        if (proposals.length) {
          await tx
            .insert(s.allocation)
            .values(
              proposals.map((a) => ({
                userId: uid,
                invoiceId: a.invoiceId,
                paymentId: a.paymentId,
                amountMinor: a.amount.minor.toString(),
                currency: a.amount.currency,
                score: a.score,
                status: "proposed" as const,
                updatedAt: now(),
              })),
            )
            .onConflictDoNothing();
        }
      });
    },
    async setStatus(invoiceId: string, paymentId: string, status: Allocation["status"]): Promise<void> {
      const uid = writeOwner();
      const r = await db
        .update(s.allocation)
        .set({ status, updatedAt: now() })
        .where(and(eq(s.allocation.userId, uid), eq(s.allocation.invoiceId, invoiceId), eq(s.allocation.paymentId, paymentId)))
        .returning({ id: s.allocation.invoiceId });
      one(r);
    },
  };

  /* ------------------------------- packs ------------------------------- */
  const packs = {
    /** `id` may be supplied so file blob keys (`u/{user}/packs/{id}/...`) can be built first. */
    async create(p: { id?: string; month: YearMonth; adBankId: string; layoutId: string; files: PackFile[] }): Promise<PackRecord> {
      const uid = writeOwner();
      const [row] = await db
        .insert(s.pack)
        .values({ ...p, id: p.id ?? newId(), userId: uid, generatedAt: now() })
        .returning();
      return row!;
    },
    async list(month?: YearMonth): Promise<PackRecord[]> {
      const uid = await readOwner();
      return db
        .select()
        .from(s.pack)
        .where(and(eq(s.pack.userId, uid), month ? eq(s.pack.month, month) : undefined))
        .orderBy(asc(s.pack.generatedAt), asc(s.pack.id));
    },
    async get(id: string): Promise<PackRecord> {
      const uid = await readOwner();
      return one(await db.select().from(s.pack).where(and(eq(s.pack.id, id), eq(s.pack.userId, uid))));
    },
    async markSubmitted(id: string, ackDocumentId?: string): Promise<PackRecord> {
      const uid = writeOwner();
      one(await db.select({ id: s.pack.id }).from(s.pack).where(and(eq(s.pack.id, id), eq(s.pack.userId, uid))));
      if (ackDocumentId) await assertOwnsDocument(db, uid, ackDocumentId);
      const [row] = await db
        .update(s.pack)
        .set({ status: "submitted", submittedAt: now(), ...(ackDocumentId ? { ackDocumentId } : {}) })
        .where(eq(s.pack.id, id))
        .returning();
      return row!;
    },
  };

  /* ------------------------------- shares ------------------------------- */
  const shares = {
    /** Idempotent per (owner, email): an existing invited/accepted share is returned as is. */
    async invite(email: string): Promise<CaShareRecord> {
      const uid = writeOwner();
      const caEmail = email.trim().toLowerCase();
      if (!caEmail.includes("@")) throw new ValidationError("invalid email");
      const existing = (
        await db
          .select()
          .from(s.caShare)
          .where(and(eq(s.caShare.ownerUserId, uid), eq(s.caShare.caEmail, caEmail), ne(s.caShare.status, "revoked")))
      )[0];
      if (existing) return existing;
      const [row] = await db
        .insert(s.caShare)
        .values({ id: newId(), ownerUserId: uid, caEmail, token: randomBytes(24).toString("base64url"), createdAt: now() })
        .returning();
      return row!;
    },
    /** Caller is the CA (an owner-role actor of their own account) whose user email matches the invite. */
    async accept(token: string): Promise<CaShareRecord> {
      if (actor.role !== "owner") throw new ForbiddenError();
      const me = one(await db.select({ email: s.user.email }).from(s.user).where(eq(s.user.id, actor.userId)));
      const share = one(await db.select().from(s.caShare).where(eq(s.caShare.token, token)));
      if (share.status !== "invited" || share.caEmail !== me.email.toLowerCase() || share.ownerUserId === actor.userId) {
        throw new NotFoundError();
      }
      const [row] = await db
        .update(s.caShare)
        .set({ status: "accepted", caUserId: actor.userId, acceptedAt: now() })
        .where(eq(s.caShare.id, share.id))
        .returning();
      return row!;
    },
    /** Read-only look at an invite by its secret token, for the accept page. NotFoundError for an unknown token. */
    async peek(token: string): Promise<{ ownerUserId: string; ownerName: string; caEmail: string; status: "invited" | "accepted" | "revoked"; emailMatches: boolean; isOwner: boolean }> {
      if (actor.role !== "owner") throw new ForbiddenError();
      const me = one(await db.select({ email: s.user.email }).from(s.user).where(eq(s.user.id, actor.userId)));
      const share = one(await db.select().from(s.caShare).where(eq(s.caShare.token, token)));
      const owner = one(await db.select({ name: s.user.name }).from(s.user).where(eq(s.user.id, share.ownerUserId)));
      return {
        ownerUserId: share.ownerUserId,
        ownerName: owner.name,
        caEmail: share.caEmail,
        status: share.status,
        emailMatches: share.caEmail === me.email.toLowerCase(),
        isOwner: share.ownerUserId === actor.userId,
      };
    },
    /** Clients (owners) who have an accepted share with this user. */
    async listForCa(): Promise<{ shareId: string; ownerUserId: string; ownerName: string; ownerEmail: string; acceptedAt: Date | null }[]> {
      const rows = await db
        .select({ shareId: s.caShare.id, ownerUserId: s.caShare.ownerUserId, ownerName: s.user.name, ownerEmail: s.user.email, acceptedAt: s.caShare.acceptedAt })
        .from(s.caShare)
        .innerJoin(s.user, eq(s.user.id, s.caShare.ownerUserId))
        .where(and(eq(s.caShare.caUserId, actor.userId), eq(s.caShare.status, "accepted")))
        .orderBy(asc(s.user.name), asc(s.caShare.id));
      return rows;
    },
    async listForOwner(): Promise<CaShareRecord[]> {
      const uid = await readOwner();
      return db.select().from(s.caShare).where(and(eq(s.caShare.ownerUserId, uid), or(ne(s.caShare.status, "revoked")))).orderBy(asc(s.caShare.createdAt), asc(s.caShare.id));
    },
    async revoke(id: string): Promise<void> {
      const uid = writeOwner();
      one(
        await db
          .update(s.caShare)
          .set({ status: "revoked" })
          .where(and(eq(s.caShare.id, id), eq(s.caShare.ownerUserId, uid)))
          .returning({ id: s.caShare.id }),
      );
    },
  };

  /* ------------------------------- account ------------------------------- */
  const account = {
    /** Deletes the user (everything cascades) and returns all blob keys the caller must purge. */
    async deleteAll(): Promise<string[]> {
      const uid = writeOwner();
      return db.transaction(async (tx) => {
        const docs = await tx.select({ k: s.document.blobKey }).from(s.document).where(eq(s.document.userId, uid));
        const ps = await tx.select({ f: s.pack.files }).from(s.pack).where(eq(s.pack.userId, uid));
        const keys = [...docs.map((d) => d.k), ...ps.flatMap((p) => p.f.map((x) => x.blobKey))];
        await tx.delete(s.user).where(eq(s.user.id, uid));
        return [...new Set(keys)];
      });
    },
  };

  return { profile, banks, documents, invoices, payments, allocations, packs, shares, account };
}

export type Repos = ReturnType<typeof createRepos>;
