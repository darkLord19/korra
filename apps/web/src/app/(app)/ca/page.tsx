import Link from "next/link";
import { listCaClients } from "@korra/backend";
import { Card, CardBody, CardHeader, buttonClass, currentMonthIST, dateLabel } from "@korra/ui";
import { ownerCtx } from "@/server/ctx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Clients" };

export default async function CaClientsPage() {
  const clients = await listCaClients(await ownerCtx());
  const month = currentMonthIST();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold">Clients</h1>
        <p className="mt-2 max-w-prose text-sm text-muted">People who have shared their export records with you. You can view and download their EDF packs and realisation tracker. You cannot change anything.</p>
      </div>
      {clients.length === 0 ? (
        <Card aria-labelledby="none-h">
          <CardHeader id="none-h" title="No clients yet" />
          <CardBody className="max-w-prose text-sm">When a client invites you by email, open the link in that email while signed in with the address they used. They will appear here once you accept.</CardBody>
        </Card>
      ) : (
        <Card aria-labelledby="list-h">
          <CardHeader id="list-h" title={`${clients.length} ${clients.length === 1 ? "client" : "clients"}`} />
          <CardBody className="px-0 py-0">
            <ul className="divide-y divide-line">
              {clients.map((c) => (
                <li key={c.shareId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{c.ownerName}</p>
                    <p className="truncate text-xs text-muted">{c.ownerEmail}{c.acceptedAt ? `, shared ${dateLabel(c.acceptedAt.slice(0, 10))}` : ""}</p>
                  </div>
                  <div className="flex gap-2">
                    <Link href={`/ca/${c.ownerUserId}/months/${month}`} className={buttonClass("secondary", "sm")} aria-label={`Open ${c.ownerName}'s records`}>Records</Link>
                    <Link href={`/ca/${c.ownerUserId}/tracker`} className={buttonClass("secondary", "sm")} aria-label={`Open ${c.ownerName}'s tracker`}>Tracker</Link>
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
