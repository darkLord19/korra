"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell } from "@korra/ui";

const tabOf = (path: string) => (path.startsWith("/home") ? "home" : path.startsWith("/months") ? "months" : path.startsWith("/settings") ? "settings" : undefined);

/** Picks the current tab from the URL; the server layout supplies the account bits. Render inside `WebProviders`. */
export function AppFrame({ actions, footer, children }: { actions?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const current = tabOf(usePathname());
  return <AppShell {...(current ? { current } : {})} actions={actions} footer={footer}>{children}</AppShell>;
}
