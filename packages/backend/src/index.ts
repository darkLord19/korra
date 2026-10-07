// Isomorphic main entry (`@korra/backend`): the use-cases, which run in the browser (client-only v0) as well
// as on the server. Imports only core, db, ingest, packs, zod. No better-auth, resend, supabase,
// postgres, "server-only" or Node APIs. Server-only pieces (createDeps, env, auth, Resend mailer) live in
// `@korra/backend/server`; the browser Deps (createLocalDeps, ensureLocalOwner) in `@korra/backend/browser`.

export const PACKAGE = "@korra/backend";

export type { Deps, Ctx, Ingester } from "./deps-types";
export type { Mailer, MailMessage } from "./mailer-types";
export { createMemoryMailer } from "./mailer";
export type { MemoryMailer } from "./mailer";
export { ForbiddenError, NotFoundError, ValidationError, UnauthenticatedError, toWireError, UNKNOWN_ERROR } from "./errors";
export { toWire } from "./wire";

export { getOnboarding, saveProfile, saveBank, suggestProfileFromInvoice } from "./onboarding";
export { requestUpload, confirmUpload, runIngest, sweepStuckIngests, requeueStuckIngests, listDocuments } from "./uploads";
export { getMonthState, editField, decideAllocation, linkNoc } from "./review";
export { generatePack, getPackDownloads, markPackSubmitted, listPacks, layoutIdFor, isPlaceholderLayout } from "./packs";
export { getTracker } from "./tracker";
export { createInvoiceManually, createPaymentManually, confirmAllFields } from "./manual";
export { runDailyNotifications, composeNotification } from "./notifications";
export { inviteCa, getCaInvite, acceptCaInvite, listCaClients, listMyCas, revokeCa } from "./ca";
export { deleteAccount } from "./account";

export * from "./inputs";
export * from "./wire-values";
export type * from "./wire-types";
