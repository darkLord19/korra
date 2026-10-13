import type { PackDownloadsWire } from "@korra/backend/schemas";
import { money, monthLabel } from "../lib/format";

/** The mailto: link for the email to the bank: subject, body (with the attached file names) and recipient. */
export function buildMailtoUrl({
  contactEmail,
  subject,
  intro,
  packMonth,
  bankName,
  adCode,
  summary,
  files,
}: {
  contactEmail: string;
  subject?: string;
  intro?: string;
  packMonth: string;
  bankName: string;
  adCode?: string | null;
  summary?: PackDownloadsWire["summary"];
  files: { name: string }[];
}): string {
  const sub = subject || `EDF Submission - ${monthLabel(packMonth)} - ${bankName} (AD Code: ${adCode || "—"})`;
  const introText = intro || `Please find attached our Export Declaration Form (EDF) submission for ${monthLabel(packMonth)}.`;
  const totalsStr = summary?.totals.length
    ? summary.totals.map((t) => money(t)).join(", ")
    : "—";

  const lines = [
    introText,
    "",
    `Exporter: ${summary?.exporterName || "Exporter"}`,
    `Month: ${monthLabel(packMonth)}`,
    `AD Code: ${adCode || "—"}`,
    `Invoices: ${summary?.invoiceCount ?? 0}`,
    `Total: ${totalsStr}`,
    "",
    "Attached files:",
    ...files.map((f) => `- ${f.name}`),
    "",
    "Please acknowledge receipt of this submission and provide an EDF reference number.",
    "",
    "Regards,",
    summary?.signatoryName || summary?.exporterName || "",
  ];

  const body = lines.join("\n");
  const params = new URLSearchParams();
  params.set("subject", sub);
  params.set("body", body);
  return `mailto:${contactEmail}?${params.toString().replace(/\+/g, "%20")}`;
}

/** The parts of a mailto: link built by `buildMailtoUrl`, for showing the draft on screen. */
export function parseMailto(url: string): { to: string; subject: string; body: string } {
  const rest = url.replace(/^mailto:/, "");
  const q = rest.indexOf("?");
  const params = new URLSearchParams(q < 0 ? "" : rest.slice(q + 1));
  return { to: q < 0 ? rest : rest.slice(0, q), subject: params.get("subject") ?? "", body: params.get("body") ?? "" };
}
