import type { ReactNode } from "react";
import Link from "next/link";
import { Footer } from "@korra/ui";
import { BootGate } from "@/components/BootGate";
import { MainNav } from "@/components/MainNav";
import { PrivacyNotice } from "@/components/PrivacyCopy";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">Skip to content</a>
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-serif text-xl font-semibold tracking-tight">Korra</Link>
          <MainNav />
        </div>
      </header>
      <PrivacyNotice />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8"><BootGate>{children}</BootGate></main>
      <div className="mx-auto w-full max-w-5xl px-4 text-xs text-muted">Your documents and details are stored only in this browser. Korra has no server copy.{" "}<Link href="/privacy" className="underline">Privacy</Link></div>
      <Footer />
    </div>
  );
}
