"use client";
import { createContext, useContext, type AnchorHTMLAttributes, type ComponentType, type ReactNode } from "react";
import type { KorraApi } from "./api";

export type NavLinkProps = Pick<AnchorHTMLAttributes<HTMLAnchorElement>, "className" | "children" | "title" | "aria-label" | "id"> & { href: string };

/**
 * What the screens need from the app's router. Supplied by the app (next/link and useRouter in apps/web,
 * its own in apps/local). The screens never import a router.
 */
export interface KorraNav {
  /** An anchor that navigates client-side. */
  Link: ComponentType<NavLinkProps>;
  push(href: string): void;
  /** Re-fetch whatever the app renders on the server. A no-op for apps that render only in the browser. */
  refresh(): void;
  hrefs: {
    home(): string;
    onboarding(): string;
    month(month: string): string;
    pack(packId: string): string;
    tracker(): string;
    settings(): string;
  };
}

const ApiContext = createContext<KorraApi | null>(null);
const NavContext = createContext<KorraNav | null>(null);

export function NavProvider({ nav, children }: { nav: KorraNav; children: ReactNode }) {
  return <NavContext.Provider value={nav}>{children}</NavContext.Provider>;
}

/** Gives the screens below it their `KorraApi` adapter and `KorraNav`. */
export function KorraProvider({ api, nav, children }: { api: KorraApi; nav: KorraNav; children: ReactNode }) {
  return (
    <ApiContext.Provider value={api}>
      <NavContext.Provider value={nav}>{children}</NavContext.Provider>
    </ApiContext.Provider>
  );
}

export function useApi(): KorraApi {
  const api = useContext(ApiContext);
  if (!api) throw new Error("@korra/ui: render inside <KorraProvider>");
  return api;
}

export function useNav(): KorraNav {
  const nav = useContext(NavContext);
  if (!nav) throw new Error("@korra/ui: render inside <KorraProvider> or <NavProvider>");
  return nav;
}
