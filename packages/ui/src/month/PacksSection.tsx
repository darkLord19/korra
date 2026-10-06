"use client";
import { edfDueDate } from "@korra/core";
import type { BlockerWire, InvoiceWire, MonthStateWire, PackWire } from "@korra/backend/schemas";
import { Alert, Badge, Card, CardBody, CardHeader } from "../components";
import { useNav, type KorraNav } from "../context";
import { FIELD_LABELS, dateLabel, monthLabel } from "../lib/format";
import { GenerateButton } from "./GenerateButton";
import { invoiceAnchor } from "./InvoicesSection";

/** `href` is an in-page anchor ("#...") or an app route (use the nav's Link). */
function describe(b: BlockerWire, invoices: InvoiceWire[], nav: KorraNav): { text: string; href: string } {
  const inv = (id: string) => invoices.find((i) => i.id === id)?.invoiceNo.value ?? "(no number)";
  switch (b.kind) {
    case "no_invoices": return { text: "There are no invoices for this month and bank yet. Upload an invoice first.", href: "#upload" };
    case "document_pending": return { text: "A document is still being read. Wait a moment, then check again.", href: "#documents" };
    case "missing_field":
      return b.entity === "exporter"
        ? { text: `Your profile is missing ${FIELD_LABELS[b.field] ?? b.field}.`, href: nav.hrefs.onboarding() }
        : { text: `Invoice ${inv(b.id)} is missing ${FIELD_LABELS[b.field] ?? b.field}.`, href: `#${invoiceAnchor(b.id, b.field)}` };
    case "flagged_field":
      return { text: `Check ${FIELD_LABELS[b.field] ?? b.field} on invoice ${inv(b.id)}: Korra was only ${Math.round(b.confidence * 100)}% sure. Confirm or correct it.`, href: `#${invoiceAnchor(b.id, b.field)}` };
  }
}

export function PacksSection({ month, blockersByBank, invoices, packs, readOnly = false, onChanged }: {
  month: string;
  blockersByBank: MonthStateWire["blockersByBank"];
  invoices: InvoiceWire[]; packs: PackWire[]; readOnly?: boolean; onChanged?: (() => void) | undefined;
}) {
  const nav = useNav();
  const { Link } = nav;
  return (
    <Card aria-labelledby="packs-h" id="packs">
      <CardHeader id="packs-h" title="EDF packs" description={`${readOnly ? "" : "One pack per AD bank. "}EDFs for ${monthLabel(month)} are due by ${dateLabel(edfDueDate(month))}.`} />
      <CardBody className="space-y-6">
        {blockersByBank.length === 0 && <p className="text-sm text-muted">{readOnly ? "No AD banks on this account." : "Add an AD bank in your profile to generate a pack."}</p>}
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
                  {b.blockers.map((bl, i) => {
                    const d = describe(bl, invoices, nav);
                    return <li key={i}>{d.text} {d.href.startsWith("#") ? <a href={d.href} className="text-accent underline">Go to it</a> : <Link href={d.href} className="text-accent underline">Go to it</Link>}</li>;
                  })}
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
