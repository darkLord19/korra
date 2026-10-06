import type { RequestUploadInput } from "@korra/backend/schemas";
import { KorraApiError, UNSUPPORTED_FILE_MESSAGE, mimeOf, type KorraApi } from "@korra/ui";
import type { ActionResult } from "@/lib/action-result";
import {
  confirmAllFieldsAction, confirmUploadAction, createInvoiceManuallyAction, createPaymentManuallyAction, decideAllocationAction,
  editFieldAction, generatePackAction, getMonthStateAction, getOnboardingAction, getPackDownloadsAction, getTrackerAction,
  linkNocAction, listDocumentsAction, listPacksAction, markPackSubmittedAction, requestUploadAction, saveBankAction, saveProfileAction,
} from "@/server/actions";

async function call<T>(result: Promise<ActionResult<T>>): Promise<T> {
  const r = await result;
  if (r.ok) return r.data;
  throw new KorraApiError(r.error);
}

/**
 * The web app's KorraApi: server actions for every use-case. Uploads go straight from the browser to the signed
 * URL (Supabase Storage; `/api/dev-upload` in the dev in-memory mode), then a confirm action schedules ingest.
 */
export const serverApi: KorraApi = {
  capabilities: { caSharing: true, accountDeletion: "server", backup: false },

  getOnboarding: () => call(getOnboardingAction()),
  saveProfile: (input) => call(saveProfileAction(input)),
  saveBank: (input) => call(saveBankAction(input)),

  getMonthState: (month) => call(getMonthStateAction(month)),
  listDocuments: (month) => call(listDocumentsAction(month)),
  listPacks: (month) => call(listPacksAction(month)),

  async uploadFile(file, { month, hint }) {
    const mimeType = mimeOf(file);
    if (!mimeType) throw new KorraApiError({ kind: "validation", message: UNSUPPORTED_FILE_MESSAGE });
    const { documentId, uploadUrl } = await call(
      requestUploadAction({ filename: file.name, mimeType: mimeType as RequestUploadInput["mimeType"], sizeBytes: file.size, month, ...(hint ? { hint } : {}) }),
    );
    // Mirrors supabase-js `uploadToSignedUrl`: a multipart body with `cacheControl` and the file as the unnamed part.
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", new File([file], file.name, { type: mimeType }));
    const put = await fetch(uploadUrl, { method: "PUT", body }).catch(() => null);
    if (!put?.ok) throw new KorraApiError({ kind: "unknown", message: "The upload did not complete. Try again." });
    await call(confirmUploadAction(documentId));
    return { documentId };
  },

  editField: (input) => call(editFieldAction(input)),
  decideAllocation: (input) => call(decideAllocationAction(input)),
  linkNoc: (input) => call(linkNocAction(input)),
  createInvoiceManually: (input) => call(createInvoiceManuallyAction(input)),
  createPaymentManually: (input) => call(createPaymentManuallyAction(input)),
  confirmAllFields: (input) => call(confirmAllFieldsAction(input)),

  generatePack: (input) => call(generatePackAction(input)),
  getPackDownloads: (packId) => call(getPackDownloadsAction(packId)),
  markPackSubmitted: (input) => call(markPackSubmittedAction(input)),

  getTracker: () => call(getTrackerAction()),
};
