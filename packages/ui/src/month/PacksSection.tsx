"use client";
import { edfDueDate } from "@korra/core";
import type { BlockerWire, InvoiceWire, MonthStateWire, PackWire } from "@korra/backend/schemas";
import { Alert, Badge, Card, CardBody, CardHeader } from "../components";
import { useNav, type KorraNav } from "../context";
import { FIELD_LABELS, dateLabel, monthLabel } from "../lib/format";
import { GenerateButton } from "./GenerateButton";
import { invoiceAnchor } from "./InvoicesSection";

type Item = { text: string; href: string; link: string };
type Flagged = Extract<BlockerWire, { kind: "flagged_field" }>;
const fieldLabel = (f: string) => FIELD_LABELS[f] ?? f;

/** `href` is an in-page anchor ("#...") or an app route (use the nav's Link). */
function describe(b: BlockerWire, invoices: InvoiceWire[], nav: KorraNav): Item {
  const inv = (id: string) => invoices.find((i) => i.id === id)?.invoiceNo.value ?? "(no number)";
  switch (b.kind) {
    case "no_invoices": return { text: "There are no invoices for this month and bank yet. Upload an invoice first.", href: "#upload", link: "Go to upload" };
    case "document_pending": return { text: "A document is still being read. Wait a moment, then check again.", href: "#documents", link: "See documents" };
    case "missing_field":
      return b.entity === "exporter"
        ? { text: `Your profile is missing ${fieldLabel(b.field)}.`, href: nav.hrefs.onboarding(), link: "Open your details" }
        : { text: `Invoice ${inv(b.id)} is missing ${fieldLabel(b.field)}.`, href: `#${invoiceAnchor(b.id, b.field)}`, link: `Add ${fieldLabel(b.field)}` };
    case "flagged_field":
      return { text: `Check ${fieldLabel(b.field)} on invoice ${inv(b.id)}: Korra was only ${Math.round(b.confidence * 100)}% sure. Confirm or correct it.`, href: `#${invoiceAnchor(b.id, b.field)}`, link: `Go to ${fieldLabel(b.field)}` };
  }
}

/** One list item per blocker, except that several flagged fields on one invoice collapse into one. Missing fields come first, then flags, then the rest. */
function items(blockers: BlockerWire[], invoices: InvoiceWire[], nav: KorraNav): Item[] {
  const flagged = new Map<string, Flagged[]>();
  for (const b of blockers) if (b.kind === "flagged_field") flagged.set(b.id, [...(flagged.get(b.id) ?? []), b]);
  const missing = blockers.filter((b) => b.kind === "missing_field").map((b) => describe(b, invoices, nav));
  const flags = [...flagged.values()].map((fs): Item => {
    const [first] = fs;
    if (fs.length === 1 || !first) return describe(first!, invoices, nav);
    const no = invoices.find((i) => i.id === first.id)?.invoiceNo.value ?? "(no number)";
    return {
      text: `Confirm ${fs.length} fields on invoice ${no}: ${fs.map((f) => fieldLabel(f.field)).join(", ")}. Use \u201cI\u2019ve checked these\u201d on the invoice if they look right.`,
      href: `#${invoiceAnchor(first.id, first.field)}`,
      link: `Go to invoice ${no}`,
    };
  });
  const rest = blockers.filter((b) => b.kind !== "missing_field" && b.kind !== "flagged_field").map((b) => describe(b, invoices, nav));
  return [...missing, ...flags, ...rest];
}

export function PacksSection({ month, blockersByBank, invoices, packs, readOnly = false, onChanged, mode = "full" }: {
  month: string;
  blockersByBank: MonthStateWire["blockersByBank"];
  invoices: InvoiceWire[]; packs: PackWire[]; readOnly?: boolean; onChanged?: (() => void) | undefined;
  mode?: "full" | "edf";
}) {
  const nav = useNav();
  const { Link } = nav;
  return (
    <Card aria-labelledby="packs-h" id="packs">
      <CardHeader id="packs-h" title={mode === "edf" ? "Your EDF pack" : "EDF packs"} description={`${readOnly ? "" : "One pack per AD bank. "}EDFs for ${monthLabel(month)} are due by ${dateLabel(edfDueDate(month))}.`} />
      <CardBody className="space-y-6">
        {blockersByBank.length === 0 && <p className="text-sm text-muted">{readOnly ? "No AD banks on this account." : "Choose your bank in your profile to generate a pack."}</p>}
        {blockersByBank.map((b) => (
          <div key={b.adBankId} className="space-y-3 rounded-md border border-line p-4">
            <h3 className="font-medium">{b.adBankName}</h3>
            {!readOnly && b.placeholderLayout && (
              <Alert tone="warning" title="Placeholder layout">
                We do not have {b.adBankName}&rsquo;s official EDF format yet, so this pack uses a stand-in layout. Check it against your bank&rsquo;s form before submitting.
              </Alert>
            )}
            {readOnly ? null : b.blockers.length > 0 ? (
              <div>
                <p className="text-sm font-medium">Fix these before you can generate the pack:</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {items(b.blockers, invoices, nav).map((d, i) => (
                    <li key={i}>{d.text} {d.href.startsWith("#") ? <a href={d.href} className="whitespace-nowrap text-accent underline">{d.link}</a> : <Link href={d.href} className="whitespace-nowrap text-accent underline">{d.link}</Link>}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <GenerateButton month={month} adBankId={b.adBankId} onChanged={onChanged} />
            )}
            {packs.filter((p) => p.adBankId === b.adBankId).map((p) => (
              <p key={p.id} className="text-sm">
                <Link href={nav.hrefs.pack(p.id)} className="text-accent underline">Pack generated {dateLabel(p.generatedAt.slice(0, 10))}</Link>{" "}
                {p.status === "submitted" ? <Badge tone="ok">Submitted</Badge> : <Badge>Not submitted</Badge>}
              </p>
            ))}
            {readOnly && !packs.some((p) => p.adBankId === b.adBankId) && <p className="text-sm text-muted">No pack generated yet.</p>}
          </div>
        ))}
      </CardBody>
    </Card>
  );
}
