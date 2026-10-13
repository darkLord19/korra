"use client";
import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { AppShell, NavProvider } from "@korra/ui";
import { useLocalNav } from "@/lib/nav";
import { BootGate } from "./BootGate";

const tabOf = (path: string) => (path.startsWith("/home") ? "home" : path.startsWith("/month") ? "months" : path.startsWith("/settings") ? "settings" : undefined);

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
