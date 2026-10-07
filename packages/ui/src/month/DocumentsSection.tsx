"use client";
import { useState } from "react";
import type { AdBankWire, DocumentWire } from "@korra/backend/schemas";
import { Badge, Button, Card, CardBody, CardHeader, FileName } from "../components";
import { useNav } from "../context";
import { usePoll } from "../lib/use-poll";
import { ManualEntryPanel } from "./ManualEntry";

const KIND: Record<string, string> = { invoice: "Invoice", statement: "Statement", fira: "FIRA", noc: "NOC", ack: "Bank acknowledgement", unknown: "Unrecognised" };

/** A document Korra could not turn into records: the user can type them in. */
const needsHandEntry = (d: DocumentWire) => d.status === "failed" || (d.status === "ingested" && d.kind === "unknown");

export function DocumentsSection({ month, documents, banks, lastSacCode, readOnly = false, onChanged, onPoll }: {
  month: string; documents: DocumentWire[]; banks: AdBankWire[]; lastSacCode?: string | null | undefined; readOnly?: boolean;
  /** Called after the user adds records by hand. */
  onChanged?: (() => void) | undefined;
  /** Called every few seconds while documents are still being read. Defaults to the app's `nav.refresh`. */
  onPoll?: (() => void) | undefined;
}) {
  const nav = useNav();
  const [entering, setEntering] = useState<string | null>(null);
  const pending = documents.some((d) => d.status === "uploaded" || d.status === "ingesting");
  usePoll(pending, () => (onPoll ?? nav.refresh)());
  return (
    <Card aria-labelledby="documents-h" id="documents">
      <CardHeader id="documents-h" title="Documents" description={pending ? "Korra is reading your files. This page updates by itself." : undefined} />
      <CardBody className="px-0 py-0">
        {documents.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Nothing uploaded for this month yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {documents.map((d) => (
              <li key={d.id} className="px-5 py-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <FileName name={d.filename} className="font-medium" />
                    {d.status === "failed" && d.error && <p className="mt-1 max-w-prose text-danger">{d.error}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    {d.kind && <Badge>{KIND[d.kind]}</Badge>}
                    {d.status === "ingested" && d.kind !== "ack" && <Badge tone="ok">Read</Badge>}
                    {(d.status === "uploaded" || d.status === "ingesting") && <Badge tone="accent">Reading...</Badge>}
                    {d.status === "failed" && <Badge tone="danger">Could not read</Badge>}
                    {!readOnly && needsHandEntry(d) && entering !== d.id && (
                      <Button size="sm" variant="secondary" onClick={() => setEntering(d.id)} aria-label={`Enter details by hand for ${d.filename}`}>Enter details by hand</Button>
                    )}
                  </div>
                </div>
                {!readOnly && entering === d.id && (
                  <div className="mt-3">
                    <ManualEntryPanel month={month} documentId={d.id} banks={banks} lastSacCode={lastSacCode} onCancel={() => setEntering(null)} onDone={() => { setEntering(null); onChanged?.(); }} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
