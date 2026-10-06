import { ALLOWED_UPLOAD_MIME_TYPES } from "@korra/backend/schemas";

const MIME_BY_EXT: Record<string, string> = {
  csv: "text/csv", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};

/** The upload MIME type for a picked file, or null when the type is not supported. Adapters use it too. */
export function mimeOf(file: File): string | null {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  const declared = file.type;
  if ((ALLOWED_UPLOAD_MIME_TYPES as readonly string[]).includes(declared)) return declared;
  return MIME_BY_EXT[ext] ?? null; // some browsers report CSVs as application/vnd.ms-excel or ""
}
