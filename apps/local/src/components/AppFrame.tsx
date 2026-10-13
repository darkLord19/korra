"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell, NavProvider } from "@korra/ui";
import { useLocalNav } from "@/lib/nav";
import { BootGate } from "./BootGate";

const under = (path: string, base: string) => path === base || path.startsWith(`${base}/`);
const tabOf = (path: string) =>
  under(path, "/home") ? "home" : under(path, "/months") || under(path, "/pack") ? "months" : under(path, "/settings") || under(path, "/privacy") ? "settings" : undefined;

/** The shell sits outside `BootGate` (the tabs work while the database opens), so it gets the nav on its own. */
export function AppFrame({ banners, belowMain, footer, children }: { banners?: ReactNode; belowMain?: ReactNode; footer?: ReactNode; children: ReactNode }) {
  const nav = useLocalNav();
  const current = tabOf(usePathname());
  return (
    <NavProvider nav={nav}>
      <AppShell {...(current ? { current } : {})} banners={banners} belowMain={belowMain} footer={footer}>
        <BootGate>{children}</BootGate>
      </AppShell>
    </NavProvider>
  );
}
