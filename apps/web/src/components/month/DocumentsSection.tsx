import type { DocumentWire } from "@korra/backend/schemas";
import { Badge, Card, CardBody, CardHeader } from "@/components/ui";
import { AutoRefresh } from "./AutoRefresh";

const KIND: Record<string, string> = { invoice: "Invoice", statement: "Statement", fira: "FIRA", noc: "NOC", ack: "Bank acknowledgement", unknown: "Unrecognised" };

export function DocumentsSection({ documents }: { documents: DocumentWire[] }) {
  const pending = documents.some((d) => d.status === "uploaded" || d.status === "ingesting");
  return (
    <Card aria-labelledby="documents-h" id="documents">
      <AutoRefresh active={pending} />
      <CardHeader id="documents-h" title="Documents" description={pending ? "Korra is reading your files. This page updates by itself." : undefined} />
      <CardBody className="px-0 py-0">
        {documents.length === 0 ? (
          <p className="px-5 py-4 text-sm text-muted">Nothing uploaded for this month yet.</p>
        ) : (
          <ul className="divide-y divide-line">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-start justify-between gap-2 px-5 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{d.filename}</p>
                  {d.status === "failed" && d.error && <p className="mt-1 max-w-prose text-danger">{d.error}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {d.kind && <Badge>{KIND[d.kind]}</Badge>}
                  {d.status === "ingested" && d.kind !== "ack" && <Badge tone="ok">Read</Badge>}
                  {(d.status === "uploaded" || d.status === "ingesting") && <Badge tone="accent">Reading...</Badge>}
                  {d.status === "failed" && <Badge tone="danger">Could not read</Badge>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardBody>
    </Card>
  );
}
