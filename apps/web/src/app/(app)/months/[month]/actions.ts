"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import {
  confirmUpload, decideAllocation, editField, generatePack, linkNoc, requestUpload, runIngest,
  type BlockerWire, type EditFieldInput, type RequestUploadInput, type RequestUploadResult,
} from "@korra/backend";
import { ownerCtx } from "@/server/ctx";
import { getDeps, isDevInMemory } from "@/server/deps";
import { toFormState } from "@/server/errors";

type Result<T = object> = { ok: false; error: string } | ({ ok: true } & T);
const fail = (e: unknown) => ({ ok: false as const, error: toFormState(e).error ?? "Something went wrong. Try again." });

export async function requestUploadAction(input: RequestUploadInput): Promise<Result<{ upload: RequestUploadResult }>> {
  try {
    const r = await requestUpload(await ownerCtx(), input);
    // Dev in-memory mode: memory:// URLs are not HTTP, so point the browser at the dev route instead.
    const uploadUrl = isDevInMemory() ? `/api/dev-upload?token=${encodeURIComponent(r.token)}` : r.uploadUrl;
    return { ok: true, upload: { ...r, uploadUrl } };
  } catch (e) {
    return fail(e);
  }
}

/** After the browser's PUT: mark the document ingesting and run the ingest job after the response (not for acknowledgements). */
export async function confirmUploadAction(documentId: string): Promise<Result> {
  try {
    const { documentId: id, ingest } = await confirmUpload(await ownerCtx(), documentId);
    if (ingest) {
      const deps = await getDeps();
      after(() => runIngest(deps, id));
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function editFieldAction(month: string, input: EditFieldInput): Promise<Result> {
  try {
    await editField(await ownerCtx(), input);
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/months/${month}`);
  return { ok: true };
}

export async function decideAllocationAction(month: string, invoiceId: string, paymentId: string, decision: "confirm" | "reject"): Promise<Result> {
  try {
    await decideAllocation(await ownerCtx(), { invoiceId, paymentId, decision });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/months/${month}`);
  return { ok: true };
}

export async function linkNocAction(month: string, paymentId: string, documentId: string): Promise<Result> {
  try {
    await linkNoc(await ownerCtx(), { paymentId, documentId });
  } catch (e) {
    return fail(e);
  }
  revalidatePath(`/months/${month}`);
  return { ok: true };
}

export async function generatePackAction(month: string, adBankId: string): Promise<{ blockers: BlockerWire[] } | { error: string }> {
  let packId: string;
  try {
    const r = await generatePack(await ownerCtx(), { month, adBankId });
    if (!r.ok) {
      revalidatePath(`/months/${month}`);
      return { blockers: r.blockers };
    }
    packId = r.packId;
  } catch (e) {
    return { error: toFormState(e).error ?? "Something went wrong. Try again." };
  }
  redirect(`/packs/${packId}`);
}
