import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Stored shape of a `Field<T>` (Money is `{ minor: string, currency }`, never bigint, since
 * JSON cannot carry bigint). Conversion to/from core types happens only in `mapping.ts`.
 */
export interface StoredField {
  value: unknown;
  confidence: number;
  source: "extracted" | "user" | "default";
}

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const field = (name: string) => jsonb(name).$type<StoredField>().notNull();

/* ------------------------------------------------------------------ */
/* Better Auth core tables (Drizzle adapter, provider "pg"). Keys must */
/* stay `user`, `session`, `account`, `verification`.                  */
/* ------------------------------------------------------------------ */

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: ts("created_at").notNull().defaultNow(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
  /** Korra addition. Declare it in Better Auth `user.additionalFields`. Nothing enforces it in Phase 1. */
  plan: text("plan").notNull().default("free"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: ts("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (t) => [index("session_user_id_idx").on(t.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: ts("access_token_expires_at"),
    refreshTokenExpiresAt: ts("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("account_user_id_idx").on(t.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: ts("expires_at").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  (t) => [index("verification_identifier_idx").on(t.identifier)],
);

/* ------------------------------ domain ------------------------------ */

const ownerId = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const exporterProfile = pgTable("exporter_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  legalName: text("legal_name").notNull(),
  address: text("address").notNull(),
  pan: text("pan").notNull(),
  gstin: text("gstin").notNull(),
  iec: text("iec"),
  defaultSacCodes: jsonb("default_sac_codes").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  defaultAdBankId: text("default_ad_bank_id").notNull(),
  updatedAt: ts("updated_at").notNull().defaultNow(),
});

export const adBank = pgTable(
  "ad_bank",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    name: text("name").notNull(),
    adCode: text("ad_code").notNull(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("ad_bank_user_idx").on(t.userId)],
);

export const document = pgTable(
  "document",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    kind: text("kind", { enum: ["invoice", "statement", "fira", "noc", "ack", "unknown"] }),
    month: text("month"),
    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    blobKey: text("blob_key").notNull(),
    status: text("status", { enum: ["uploaded", "ingesting", "ingested", "failed"] })
      .notNull()
      .default("uploaded"),
    attempts: integer("attempts").notNull().default(0),
    error: text("error"),
    statusChangedAt: ts("status_changed_at").notNull().defaultNow(),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("document_user_month_idx").on(t.userId, t.month),
    index("document_status_idx").on(t.status, t.statusChangedAt),
  ],
);

export const invoice = pgTable(
  "invoice",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    documentId: text("document_id").references(() => document.id, { onDelete: "set null" }),
    /** Denormalised from the invoiceDate field value. Null until known. */
    month: text("month"),
    /** Denormalised from the adBankId field value. */
    adBankId: text("ad_bank_id"),
    invoiceNo: field("invoice_no"),
    invoiceDate: field("invoice_date"),
    clientName: field("client_name"),
    clientAddress: field("client_address"),
    clientCountry: field("client_country"),
    amount: field("amount"),
    netRealisableValue: field("net_realisable_value"),
    contractRef: field("contract_ref"),
    serviceDescription: field("service_description"),
    sacCode: field("sac_code"),
    /** The `adBankId` Field of InvoiceFacts (the denormalised copy above is `ad_bank_id`). */
    adBankIdField: field("ad_bank_id_field"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("invoice_user_month_idx").on(t.userId, t.month)],
);

export const payment = pgTable(
  "payment",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    documentId: text("document_id").references(() => document.id, { onDelete: "set null" }),
    nocDocumentId: text("noc_document_id").references(() => document.id, { onDelete: "set null" }),
    rail: text("rail", { enum: ["deel", "generic"] }).notNull(),
    /** Denormalised from the payment date field value. */
    month: text("month"),
    receiptMode: field("receipt_mode"),
    date: field("date"),
    foreignAmount: field("foreign_amount"),
    inrCredited: field("inr_credited"),
    fxRate: field("fx_rate"),
    fees: field("fees"),
    firaRef: field("fira_ref"),
    purposeCode: field("purpose_code"),
    payerName: field("payer_name"),
    realisingBankName: field("realising_bank_name"),
    createdAt: ts("created_at").notNull().defaultNow(),
  },
  (t) => [index("payment_user_month_idx").on(t.userId, t.month)],
);

export const allocation = pgTable(
  "allocation",
  {
    userId: ownerId(),
    invoiceId: text("invoice_id")
      .notNull()
      .references(() => invoice.id, { onDelete: "cascade" }),
    paymentId: text("payment_id")
      .notNull()
      .references(() => payment.id, { onDelete: "cascade" }),
    amountMinor: text("amount_minor").notNull(),
    currency: text("currency").notNull(),
    score: real("score").notNull(),
    status: text("status", { enum: ["proposed", "confirmed", "rejected"] }).notNull(),
    updatedAt: ts("updated_at").notNull().defaultNow(),
  },
  // The composite primary key is the unique (invoice_id, payment_id) constraint.
  (t) => [
    primaryKey({ columns: [t.invoiceId, t.paymentId] }),
    index("allocation_user_idx").on(t.userId),
    index("allocation_payment_idx").on(t.paymentId),
  ],
);

export const pack = pgTable(
  "pack",
  {
    id: text("id").primaryKey(),
    userId: ownerId(),
    month: text("month").notNull(),
    adBankId: text("ad_bank_id").notNull(),
    layoutId: text("layout_id").notNull(),
    status: text("status", { enum: ["generated", "submitted"] }).notNull().default("generated"),
    files: jsonb("files").$type<{ name: string; mimeType: string; blobKey: string }[]>().notNull(),
    ackDocumentId: text("ack_document_id").references(() => document.id, { onDelete: "set null" }),
    generatedAt: ts("generated_at").notNull().defaultNow(),
    submittedAt: ts("submitted_at"),
  },
  (t) => [index("pack_user_month_idx").on(t.userId, t.month)],
);

export const fieldEdit = pgTable(
  "field_edit",
  {
    id: text("id").primaryKey(),
    /** Owner of the edited data. */
    userId: ownerId(),
    /** Who made the edit (the owner today; CAs are read-only). */
    actorUserId: text("actor_user_id").notNull(),
    entity: text("entity", { enum: ["invoice", "payment"] }).notNull(),
    entityId: text("entity_id").notNull(),
    field: text("field").notNull(),
    old: jsonb("old").$type<StoredField | null>(),
    new: jsonb("new").$type<StoredField | null>(),
    at: ts("at").notNull().defaultNow(),
  },
  (t) => [index("field_edit_entity_idx").on(t.entity, t.entityId), index("field_edit_user_idx").on(t.userId)],
);

export const caShare = pgTable(
  "ca_share",
  {
    id: text("id").primaryKey(),
    ownerUserId: text("owner_user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    caEmail: text("ca_email").notNull(),
    caUserId: text("ca_user_id").references(() => user.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    status: text("status", { enum: ["invited", "accepted", "revoked"] }).notNull().default("invited"),
    createdAt: ts("created_at").notNull().defaultNow(),
    acceptedAt: ts("accepted_at"),
  },
  (t) => [index("ca_share_owner_idx").on(t.ownerUserId), index("ca_share_ca_user_idx").on(t.caUserId)],
);

export const notificationLog = pgTable("notification_log", {
  id: text("id").primaryKey(),
  userId: ownerId(),
  dedupeKey: text("dedupe_key").notNull().unique(),
  sentAt: ts("sent_at").notNull().defaultNow(),
});

/** Every table name, for the hand-written RLS migration and tests. */
export const TABLE_NAMES = [
  "user",
  "session",
  "account",
  "verification",
  "exporter_profile",
  "ad_bank",
  "document",
  "invoice",
  "payment",
  "allocation",
  "pack",
  "field_edit",
  "ca_share",
  "notification_log",
] as const;
