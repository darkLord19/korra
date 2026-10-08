"use client";
import { useState, useTransition, type ReactNode } from "react";
import { edfDueDate } from "@korra/core";
import type { PackDownloadsWire, SubmissionChannelWire } from "@korra/backend/schemas";
import type { PackDownloads } from "../api";
import { Badge, Button, Card, CardBody, CardHeader, Field, FileName, Input, buttonClass, cx } from "../components";
import { useApi, useNav } from "../context";
import { errorMessage } from "../errors";
import { SignaturePad } from "../forms/SignaturePad";
import { dateLabel, money, monthLabel } from "../lib/format";
import { SubmitPanel } from "./SubmitPanel";

export interface PackViewProps {
  downloads: PackDownloads;
  /** Read-only views (a CA's) have no "after you submit" panel and different wording. */
  readOnly?: boolean;
  /** Called after the pack was marked submitted or regenerated: re-fetch it. */
  onChanged?: () => void;
  /** Progress shown above the page (the first-run flow passes a stepper). */
  step?: ReactNode;
}

function fileDescription(name: string): string {
  if (name.startsWith("EDF-") && name.endsWith(".pdf")) return "Official EDF request letter / Annexure (PDF) to submit to your bank.";
  if (name.startsWith("EDF-") && name.endsWith(".xlsx")) return "Structured spreadsheet with export invoice breakdown.";
  if (name.startsWith("supporting-") && name.endsWith(".zip")) return "Zip archive containing all export invoices and credit advices.";
  if (name.startsWith("HOW-TO-SUBMIT")) return "Offline guide with checklist and bank-specific instructions.";
  if (name.startsWith("DECLARATION-")) return "Statutory declaration form.";
  return "Document included in this submission pack.";
}

function buildMailtoUrl({
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

export function PackView({ downloads, readOnly = false, onChanged, step }: PackViewProps) {
  const { pack, placeholder, files, signed, submission, bank, summary, profile } = downloads;
  const api = useApi();
  const nav = useNav();
  const { Link } = nav;

  const [showSignPad, setShowSignPad] = useState(false);
  const [activeChannelIdx, setActiveChannelIdx] = useState(0);

  // Email tab inline editing
  const [emailInput, setEmailInput] = useState(bank?.contactEmail ?? "");
  const [isEditingEmail, setIsEditingEmail] = useState(!bank?.contactEmail);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailPending, startEmailSave] = useTransition();

  const bankName = bank?.name ?? "your bank";
  const channels = submission?.channels ?? [];
  const activeChannel: SubmissionChannelWire | undefined = channels[activeChannelIdx] ?? channels[0];
  const signing = submission?.signing;

  const handleRegenerate = async () => {
    const res = await api.generatePack({ month: pack.month, adBankId: pack.adBankId });
    if (res.ok) {
      setShowSignPad(false);
      if (res.packId !== pack.id) {
        nav.push(nav.hrefs.pack(res.packId));
      }
      onChanged?.();
    }
  };

  const handleSaveBankEmail = () => {
    startEmailSave(async () => {
      try {
        setEmailError(null);
        if (!emailInput.trim()) return;
        await api.saveBank({
          ...(bank?.id ? { id: bank.id } : {}),
          name: bank?.name ?? "Bank",
          adCode: bank?.adCode ?? "",
          contactEmail: emailInput.trim(),
          branch: bank?.branch ?? undefined,
        });
        setIsEditingEmail(false);
        onChanged?.();
      } catch (e) {
        setEmailError(errorMessage(e));
      }
    });
  };

  return (
    <div className="space-y-6">
      {step}
      <div>
        <Link href={nav.hrefs.month(pack.month)} className="text-sm text-accent underline">
          Back to {monthLabel(pack.month)}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold sm:text-3xl">EDF pack for {monthLabel(pack.month)}</h1>
        <p className="mt-1 text-sm text-muted">
          Generated {dateLabel(pack.generatedAt.slice(0, 10))}.{" "}
          {pack.status === "submitted" && pack.submittedAt ? (
            <Badge tone="ok">Submitted {dateLabel(pack.submittedAt.slice(0, 10))}</Badge>
          ) : (
            <Badge>Not submitted yet</Badge>
          )}
        </p>
      </div>

      {/* Step 1: Download files */}
      <Card aria-labelledby="files-h">
        <CardHeader
          id="files-h"
          title="1. Download files"
          description={api.capabilities.signedUrlsExpire ? "Download links work for 10 minutes. Reload this page for fresh ones." : undefined}
        />
        <CardBody className="px-0 py-0">
          <ul className="divide-y divide-line">
            {files.map((f) => (
              <li key={f.name} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-5 py-3 text-sm">
                <div>
                  <FileName name={f.name} />
                  <p className="text-xs text-muted mt-0.5">{fileDescription(f.name)}</p>
                </div>
                <a href={f.url} download={f.name} className={cx(buttonClass("secondary", "sm"), "shrink-0 self-start sm:self-center")}>
                  Download
                </a>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      {/* Step 2: Sign */}
      <Card aria-labelledby="sign-h">
        <CardHeader
          id="sign-h"
          title="2. Sign"
          description="Authorised signature stamped onto the EDF form."
        />
        <CardBody>
          {signed ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Badge tone="ok">Signed</Badge>
                  <span className="text-sm font-medium text-ink">
                    Signed as {summary?.signatoryName || profile?.signatoryName || "Authorised Signatory"}
                    {profile?.signatoryDesignation ? ` (${profile.signatoryDesignation})` : ""}
                  </span>
                </div>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setShowSignPad((v) => !v)}
                    className="text-xs text-accent underline"
                  >
                    {showSignPad ? "Hide signature pad" : "Change signature"}
                  </button>
                )}
              </div>

              {signing?.note ? (
                <p className="text-sm text-muted">{signing.note}</p>
              ) : signing?.wetSignature ? (
                <p className="text-sm text-muted">
                  Print the EDF form, sign and stamp it by hand before submission if required by your branch.
                </p>
              ) : null}

              {showSignPad && !readOnly && (
                <div className="pt-3 border-t border-line">
                  <SignaturePad
                    profile={profile ?? null}
                    regenerateLabel="Update signature → regenerate pack"
                    onSaved={handleRegenerate}
                  />
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Badge tone="flag">Not signed</Badge>
                <span className="text-sm text-muted">No signature stamped on this EDF yet. Add your signature below to stamp it onto the PDF.</span>
              </div>

              {signing?.note ? (
                <p className="text-sm text-muted">{signing.note}</p>
              ) : signing?.wetSignature ? (
                <p className="text-sm text-muted">
                  Print the EDF form, sign and stamp it by hand before submission if required by your branch.
                </p>
              ) : null}

              {!readOnly && (
                <SignaturePad
                  profile={profile ?? null}
                  regenerateLabel="Add signature → regenerate pack"
                  onSaved={handleRegenerate}
                />
              )}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Step 3: Submit */}
      <Card aria-labelledby="submit-channel-h">
        <CardHeader
          id="submit-channel-h"
          title="3. Submit"
          description={`Submit to ${bankName} by ${dateLabel(edfDueDate(pack.month))}.`}
        />
        <CardBody className="space-y-4">
          {placeholder && (
            <p className="text-sm text-flag bg-flag/10 border border-flag/20 rounded p-2.5">
              We couldn't find {bankName}'s own EDF form, so this uses the RBI format. Ask your branch if it's accepted.
            </p>
          )}

          {submission?.documents && submission.documents.length > 0 && (
            <div className="space-y-1.5 pb-2 border-b border-line">
              <p className="text-xs font-medium uppercase tracking-wider text-muted">Required documents</p>
              <ul className="grid gap-1 sm:grid-cols-2 text-xs text-muted">
                {submission.documents.map((doc, idx) => (
                  <li key={idx} className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-accent shrink-0" />
                    <span>{doc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {channels.length > 0 ? (
            <div className="space-y-4">
              <div className="flex border-b border-line gap-2" role="tablist">
                {channels.map((ch, idx) => {
                  const isSelected = idx === activeChannelIdx;
                  return (
                    <button
                      key={ch.kind + idx}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => setActiveChannelIdx(idx)}
                      className={cx(
                        "px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
                        isSelected
                          ? "border-accent text-accent"
                          : "border-transparent text-muted hover:text-ink hover:border-line"
                      )}
                    >
                      {ch.kind === "netbanking" ? "Netbanking" : ch.kind === "email" ? "Email" : "Branch"}
                    </button>
                  );
                })}
              </div>

              {activeChannel && (
                <div role="tabpanel" className="space-y-4 pt-1">
                  <h3 className="text-base font-semibold text-ink">{activeChannel.title}</h3>

                  {!activeChannel.verified && (
                    <p className="text-sm text-flag font-medium">Confirm this with your branch.</p>
                  )}

                  <ol className="space-y-2 list-decimal list-inside text-sm">
                    {activeChannel.steps.map((st, idx) => (
                      <li key={idx} className="text-ink leading-relaxed">
                        {st}
                      </li>
                    ))}
                  </ol>

                  {activeChannel.links.length > 0 && (
                    <div className="flex flex-wrap gap-3 pt-1">
                      {activeChannel.links.map((link) => (
                        <a
                          key={link.url}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-accent underline flex items-center gap-1"
                        >
                          {link.label} &rarr;
                        </a>
                      ))}
                    </div>
                  )}

                  {activeChannel.kind === "email" && (
                    <div className="mt-4 p-4 rounded-md border border-line bg-surface space-y-3">
                      <h4 className="text-sm font-semibold text-ink">Email draft</h4>
                      {bank?.contactEmail && !isEditingEmail ? (
                        <div className="space-y-3">
                          <div className="flex items-center justify-between text-sm">
                            <div>
                              <span className="text-muted">Branch / RM email: </span>
                              <span className="font-medium text-ink">{bank.contactEmail}</span>
                            </div>
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => {
                                  setEmailInput(bank.contactEmail ?? "");
                                  setIsEditingEmail(true);
                                }}
                                className="text-xs text-accent underline"
                              >
                                Change email
                              </button>
                            )}
                          </div>
                          <div>
                            <a
                              href={buildMailtoUrl({
                                contactEmail: bank.contactEmail,
                                subject: submission?.email?.subject,
                                intro: submission?.email?.intro,
                                packMonth: pack.month,
                                bankName,
                                adCode: bank.adCode,
                                summary,
                                files,
                              })}
                              className={cx(buttonClass("primary", "sm"), "inline-block")}
                            >
                              Open email draft
                            </a>
                            <p className="mt-1 text-xs text-muted">
                              Attach the downloaded files before sending; email links can't attach files.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-3">
                          <p className="text-xs text-muted">
                            Add your branch or Relationship Manager's email address to create a 1-click email draft.
                          </p>
                          {!readOnly && (
                            <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
                              <div className="flex-1 w-full sm:w-auto">
                                <Field id="contactEmailInput" label="Branch or RM email" error={emailError ?? undefined}>
                                  <Input
                                    id="contactEmailInput"
                                    type="email"
                                    value={emailInput}
                                    onChange={(e) => setEmailInput(e.target.value)}
                                    placeholder="e.g. branch.trade@bank.com"
                                  />
                                </Field>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <Button
                                  size="sm"
                                  disabled={emailPending || !emailInput.trim()}
                                  onClick={handleSaveBankEmail}
                                >
                                  {emailPending ? "Saving..." : "Save email"}
                                </Button>
                                {bank?.contactEmail && (
                                  <Button
                                    variant="secondary"
                                    size="sm"
                                    onClick={() => {
                                      setIsEditingEmail(false);
                                      setEmailInput(bank.contactEmail ?? "");
                                    }}
                                  >
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            </div>
                          )}
                          <div>
                            <Link href={nav.hrefs.settings()} className="text-xs text-accent underline">
                              or configure in Settings
                            </Link>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted">Check with your branch for submission instructions.</p>
          )}
        </CardBody>
      </Card>

      {/* Step 4: Mark as submitted */}
      {!readOnly && (
        <Card aria-labelledby="submit-h">
          <CardHeader
            id="submit-h"
            title="4. Mark as submitted"
            description={pack.status === "submitted" ? undefined : "Korra does not submit anything for you. Once filed with your bank, mark this pack submitted to stop reminders."}
          />
          <CardBody>
            {pack.status === "submitted" ? (
              <p className="text-sm text-ok">
                Marked as submitted{pack.submittedAt ? ` on ${dateLabel(pack.submittedAt.slice(0, 10))}` : ""}.
              </p>
            ) : (
              <SubmitPanel packId={pack.id} month={pack.month} onChanged={onChanged} />
            )}
          </CardBody>
        </Card>
      )}
    </div>
  );
}
