import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { listCaClients } from "@korra/backend";
import { Alert } from "@/components/ui";
import { currentMonthIST } from "@/lib/format";
import { ownerCtx } from "@/server/ctx";

export const dynamic = "force-dynamic";

/** Shared frame for a CA's read-only view of one client. Data access is still checked per request by caCtx(). */
export default async function ClientLayout({ children, params }: { children: ReactNode; params: Promise<{ ownerId: string }> }) {
  const { ownerId } = await params;
  const client = (await listCaClients(await ownerCtx())).find((c) => c.ownerUserId === ownerId);
  if (!client) notFound();
  const base = `/ca/${ownerId}`;
  return (
    <div className="space-y-6">
      <Alert tone="info">
        <p className="font-medium">Viewing {client.ownerName}&rsquo;s records (read-only)</p>
        <p className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          <Link href={`${base}/months/${currentMonthIST()}`} className="text-accent underline">Months and packs</Link>
          <Link href={`${base}/tracker`} className="text-accent underline">Tracker</Link>
          <Link href="/ca" className="text-accent underline">All clients</Link>
        </p>
      </Alert>
      {children}
    </div>
  );
}
