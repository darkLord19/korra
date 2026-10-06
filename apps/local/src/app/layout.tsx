import type { ReactNode } from "react";
import Link from "next/link";
import { Footer } from "@korra/ui";
import { BootGate } from "@/components/BootGate";
import "./globals.css";

export const metadata = {
  title: { default: "Korra", template: "%s | Korra" },
  description: "EDF packs and realisation tracking for Indian service exporters. Everything stays in your browser.",
};

const NAV = [
  { href: "/", label: "Month" },
  { href: "/tracker", label: "Tracker" },
  { href: "/settings", label: "Settings" },
];

/** App shell, like apps/web's (app) layout, minus accounts: the data lives in this browser. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
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
            </div>
          </header>
          <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-8"><BootGate>{children}</BootGate></main>
          <div className="mx-auto w-full max-w-5xl px-4 text-xs text-muted">Your documents and details are stored only in this browser. Korra has no server copy.</div>
          <Footer />
        </div>
      </body>
    </html>
  );
}
