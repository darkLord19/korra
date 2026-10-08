import type { YearMonth } from "@korra/core";
import type { Layout } from "./layouts";
import { edfDueDate } from "@korra/core";
import { monthLabel } from "./util";

export function renderSubmissionMarkdown(
  layout: Layout,
  bankName: string,
  month: YearMonth,
  adCode?: string,
): string {
  const vars: Record<string, string> = {
    bank: bankName,
    month: monthLabel(month),
    dueDate: edfDueDate(month),
    adCode: adCode || "—",
  };
  const sub = layout.submission;
  if (!sub) {
    if (!layout.guide) return "";
    return layout.guide.replace(/\{(bank|month|dueDate|adCode)\}/g, (_, k: string) => vars[k] ?? "");
  }

  const replaceVars = (s: string) =>
    s.replace(/\{(bank|month|dueDate|adCode)\}/g, (_, k: string) => vars[k] ?? "");

  const lines: string[] = [];
  lines.push(`# How to submit your EDF to ${bankName}`);
  lines.push("");
  lines.push(`**Month:** ${monthLabel(month)}  `);
  lines.push(`**Due by:** ${edfDueDate(month)} (within 30 days of month-end)  `);
  if (adCode) {
    lines.push(`**AD Code:** ${adCode}  `);
  }
  lines.push("");

  lines.push("## Required Documents");
  lines.push("");
  for (const doc of sub.documents) {
    lines.push(`- ${replaceVars(doc)}`);
  }
  lines.push("");

  lines.push("## Signing & Verification");
  lines.push("");
  if (sub.signing.wetSignature !== null) {
    lines.push(`- Wet signature: ${sub.signing.wetSignature ? "Required" : "Not required"}`);
  }
  if (sub.signing.seal !== null) {
    lines.push(`- Company seal / stamp: ${sub.signing.seal ? "Required" : "Not required"}`);
  }
  if (sub.signing.scannedOk !== null) {
    lines.push(`- Scanned copy accepted: ${sub.signing.scannedOk ? "Yes" : "No (confirm with branch)"}`);
  }
  if (sub.signing.dscOk !== null) {
    lines.push(`- Digital Signature Certificate (DSC): ${sub.signing.dscOk ? "Accepted" : "No / Not specified"}`);
  }
  if (sub.signing.note) {
    lines.push(`- Note: ${replaceVars(sub.signing.note)}`);
  }
  lines.push("");

  lines.push("## Submission Channels");
  lines.push("");
  sub.channels.forEach((ch, idx) => {
    lines.push(`### ${idx + 1}. ${replaceVars(ch.title)}`);
    lines.push("");
    ch.steps.forEach((step, sIdx) => {
      lines.push(`${sIdx + 1}. ${replaceVars(step)}`);
    });
    if (ch.links.length > 0) {
      lines.push("");
      lines.push("Official Links:");
      for (const link of ch.links) {
        lines.push(`- ${link.label}: ${link.url}`);
      }
    }
    if (!ch.verified) {
      lines.push("");
      lines.push("*Note: Confirm the exact procedure for this channel with your branch.*");
    }
    lines.push("");
  });

  if (sub.sources.length > 0) {
    lines.push("## Official Sources");
    lines.push("");
    for (const src of sub.sources) {
      lines.push(`- ${src.url} (retrieved ${src.retrievedAt})`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("Prepared by Korra. Not legal or tax advice. Verify before submission.");
  lines.push("");

  return lines.join("\n");
}

export const renderGuide = renderSubmissionMarkdown;
