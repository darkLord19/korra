"use server";
import { after } from "next/server";
import {
  confirmAllFields, confirmUpload, createInvoiceManually, createPaymentManually, decideAllocation, editField, generatePack,
  getMonthState, getOnboarding, getPackDownloads, getTracker, linkNoc, listDocuments, listPacks, markPackSubmitted, requestUpload,
  runIngest, saveBank, saveProfile,
  type ConfirmAllFieldsInput, type CreateInvoiceManuallyInput, type CreatePaymentManuallyInput, type DecideAllocationInput, type EditFieldInput,
  type RequestUploadInput, type SaveBankInput, type SaveProfileInput,
} from "@korra/backend";
import type { PackDownloads } from "@korra/ui";
import type { ActionResult } from "@/lib/action-result";
import { run } from "./action-result";
import { ownerCtx } from "./ctx";
import { getDeps, isDevInMemory } from "./deps";
import { packForBrowser } from "./downloads";

/**
 * The server actions behind the web app's KorraApi adapter (src/client/server-api.ts). Each calls one use-case
 * as the signed-in owner and returns `{ ok, data } | { ok: false, error }`.
 */

export const getOnboardingAction = async () => run(async () => getOnboarding(await ownerCtx()));
export const saveProfileAction = async (input: SaveProfileInput) => run(async () => saveProfile(await ownerCtx(), input));
export const saveBankAction = async (input: SaveBankInput) => run(async () => saveBank(await ownerCtx(), input));

export const getMonthStateAction = async (month: string) => run(async () => getMonthState(await ownerCtx(), month));
export const listDocumentsAction = async (month?: string) => run(async () => listDocuments(await ownerCtx(), month));
export const listPacksAction = async (month?: string) => run(async () => listPacks(await ownerCtx(), month));

export async function requestUploadAction(input: RequestUploadInput): Promise<ActionResult<{ documentId: string; uploadUrl: string }>> {
  return run(async () => {
    const r = await requestUpload(await ownerCtx(), input);
    // Dev in-memory mode: memory:// URLs are not HTTP, so point the browser at the dev route instead.
    const uploadUrl = isDevInMemory() ? `/api/dev-upload?token=${encodeURIComponent(r.token)}` : r.uploadUrl;
    return { documentId: r.documentId, uploadUrl };
  });
}

/** After the browser's PUT: mark the document ingesting and run the ingest job after the response (not for acknowledgements). */
export async function confirmUploadAction(documentId: string): Promise<ActionResult<{ documentId: string }>> {
  return run(async () => {
    const { documentId: id, ingest } = await confirmUpload(await ownerCtx(), documentId);
    if (ingest) {
      const deps = await getDeps();
      after(() => runIngest(deps, id));
    }
    return { documentId: id };
  });
}

export const editFieldAction = async (input: EditFieldInput) => run(async () => { await editField(await ownerCtx(), input); });
export const decideAllocationAction = async (input: DecideAllocationInput) => run(async () => { await decideAllocation(await ownerCtx(), input); });
export const linkNocAction = async (input: { paymentId: string; documentId: string }) => run(async () => linkNoc(await ownerCtx(), input));
export const createInvoiceManuallyAction = async (input: CreateInvoiceManuallyInput) => run(async () => createInvoiceManually(await ownerCtx(), input));
export const createPaymentManuallyAction = async (input: CreatePaymentManuallyInput) => run(async () => createPaymentManually(await ownerCtx(), input));
export const confirmAllFieldsAction = async (input: ConfirmAllFieldsInput) => run(async () => confirmAllFields(await ownerCtx(), input));

export const generatePackAction = async (input: { month: string; adBankId: string }) => run(async () => generatePack(await ownerCtx(), input));

/** Download links the browser can use, and the guide's text (read here: the signed URL may not allow a cross-origin read). */
export const getPackDownloadsAction = async (packId: string): Promise<ActionResult<PackDownloads>> =>
  run(async () => packForBrowser(await getPackDownloads(await ownerCtx(), packId)));

export const markPackSubmittedAction = async (input: { packId: string; ackDocumentId?: string }) => run(async () => markPackSubmitted(await ownerCtx(), input));

export const getTrackerAction = async () => run(async () => getTracker(await ownerCtx()));
