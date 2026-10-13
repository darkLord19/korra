import type { ReactNode } from "react";
import Link from "next/link";
import { Footer } from "@korra/ui";
import { WebProviders } from "@/client/WebProviders";
import { AppFrame } from "@/components/AppFrame";
import { SignOutButton } from "@/components/SignOutButton";
import { listCaClients } from "@korra/backend";
import { currentUser, ownerCtx } from "@/server/ctx";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** App shell. "Clients" shows only for people who are somebody's CA. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  const isCa = (await listCaClients(await ownerCtx())).length > 0;
  return (
    <WebProviders>
      <AppFrame
        actions={
          <>
            {isCa && <Link href="/ca" className="inline-flex min-h-11 items-center rounded-full px-3 font-bold hover:bg-surface-soft">Clients</Link>}
            <span className="hidden sm:inline">{user.email}</span>
            <SignOutButton />
          </>
        }
        footer={<Footer />}
      >
        {children}
      </AppFrame>
    </WebProviders>
  );
}
