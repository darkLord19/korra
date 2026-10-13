"use client";
import type { ReactNode } from "react";
import { cx } from "../components/cx";
import { useNav } from "../context";

export type AppTab = "home" | "months" | "settings";
export interface AppShellProps {
  /** The tab to mark as the current page. */
  current?: AppTab;
  /** What the top-left link shows (it always goes to `hrefs.home()`). Defaults to the "Korra" wordmark. */
  brand?: ReactNode;
  /** The top bar's right-hand side: account bits, extra links. */
  actions?: ReactNode;
  /** Full-width notices under the top bar. */
  banners?: ReactNode;
  /** Small print under the page content, above the footer. */
  belowMain?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
}

const TABS: { id: AppTab; label: string; icon: string }[] = [
  { id: "home", label: "Home", icon: "🏠" },
  { id: "months", label: "Months", icon: "🗓" },
  { id: "settings", label: "Settings", icon: "⚙️" },
];

/**
 * The app frame: skip link, a sticky top bar (tabs as pills from `md`), a fixed bottom tab bar below `md`,
 * and `<main id="main">`. Apps supply the banners, account bits and footer.
 */
export function AppShell({ current, brand, actions, banners, belowMain, footer, children }: AppShellProps) {
  const { Link, hrefs } = useNav();
  const href = { home: hrefs.home(), months: hrefs.months(), settings: hrefs.settings() };
  return (
    // Below `md` everything sits above the fixed tab bar, so the footer and small print are never covered.
    <div className="flex min-h-screen flex-col pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-full focus:bg-surface focus:px-4 focus:py-2">Skip to content</a>
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-x-6 px-4 py-2.5">
          <Link href={hrefs.home()} className="inline-flex min-h-11 items-center text-xl font-extrabold tracking-tight">{brand ?? "Korra"}</Link>
          <nav aria-label="Main" className="hidden gap-1 md:flex">
            {TABS.map((t) => (
              <Link
                key={t.id}
                href={href[t.id]}
                {...(current === t.id ? { "aria-current": "page" as const } : {})}
                className={cx(
                  "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-bold transition-colors",
                  current === t.id ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-soft hover:text-ink",
                )}
              >
                <span aria-hidden="true">{t.icon}</span>
                {t.label}
              </Link>
            ))}
          </nav>
          {actions && <div className="ml-auto flex items-center gap-2 text-sm text-muted">{actions}</div>}
        </div>
      </header>
      {banners}
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:py-8">{children}</main>
      {belowMain}
      {footer}
      <nav aria-label="Main tabs" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        <ul className="mx-auto flex max-w-md">
          {TABS.map((t) => (
            <li key={t.id} className="flex-1">
              <Link
                href={href[t.id]}
                {...(current === t.id ? { "aria-current": "page" as const } : {})}
                className={cx(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-bold",
                  current === t.id ? "text-accent" : "text-muted",
                )}
              >
                <span aria-hidden="true" className="text-xl leading-none">{t.icon}</span>
                {t.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
