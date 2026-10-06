import type { ReactNode } from "react";
import Link from "next/link";
import { Footer } from "@/components/Footer";
import { SignOutButton } from "@/components/SignOutButton";
import { currentUser } from "@/server/ctx";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", label: "Month" },
  { href: "/tracker", label: "Tracker" },
  { href: "/settings", label: "Settings" },
];

/** App shell. Stage 3b pages (tracker, settings, ca) live under this group and inherit it. */
export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-serif text-xl font-semibold tracking-tight">Korra</Link>
          <nav aria-label="Main" className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-md px-3 py-1.5 hover:bg-accent-soft">{n.label}</Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2 text-sm text-muted">
            <span className="hidden sm:inline">{user.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>
      <Footer />
    </div>
  );
}
