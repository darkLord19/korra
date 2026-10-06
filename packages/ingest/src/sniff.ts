export type SniffedKind = "csv" | "xlsx" | "pdf" | "png" | "jpeg" | "webp" | "unsupported";

const startsWith = (b: Uint8Array, sig: number[], offset = 0) =>
  b.length >= offset + sig.length && sig.every((v, i) => b[offset + i] === v);

/** Decide how to read a file from magic bytes first, then extension / mime type. */
export function sniff(bytes: Uint8Array, mimeType: string, filename: string): SniffedKind {
  const ext = filename.toLowerCase().split(".").pop() ?? "";
  const mime = mimeType.toLowerCase().split(";")[0]!.trim();

  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46])) return "pdf"; // %PDF
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return "png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) {
    return "webp"; // RIFF....WEBP
  }
  if (startsWith(bytes, [0x50, 0x4b, 0x03, 0x04])) {
    // A zip container. Only accept it as XLSX if the name/mime say so (docx etc. are also zips).
    const xlsxMime = mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
    return ext === "xlsx" || xlsxMime ? "xlsx" : "unsupported";
  }
  // Remaining binary signatures we never treat as text (e.g. legacy .xls, gzip).
  if (startsWith(bytes, [0xd0, 0xcf, 0x11, 0xe0]) || startsWith(bytes, [0x1f, 0x8b])) return "unsupported";

  const csvMime = mime === "text/csv" || mime === "application/csv" || mime === "text/plain" || mime === "application/vnd.ms-excel";
  if (ext === "csv" || (csvMime && ext !== "xls" && ext !== "xlsx")) {
    if (bytes.subarray(0, 1024).includes(0)) return "unsupported"; // NUL byte: not text
    return "csv";
  }
  return "unsupported";
}

export const LLM_MIME: Partial<Record<SniffedKind, "application/pdf" | "image/png" | "image/jpeg" | "image/webp">> = {
  pdf: "application/pdf",
  png: "image/png",
  jpeg: "image/jpeg",
  webp: "image/webp",
};
