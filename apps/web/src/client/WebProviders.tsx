"use client";
import { useMemo, type ReactNode } from "react";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { KorraProvider, NavProvider, useNav, type KorraNav, type NavLinkProps } from "@korra/ui";
import { serverApi } from "./server-api";

const WebLink = (props: NavLinkProps) => <NextLink {...props} />;

export const webHrefs: KorraNav["hrefs"] = {
  home: () => "/",
  onboarding: () => "/onboarding",
  month: (month) => `/months/${month}`,
  pack: (packId) => `/packs/${packId}`,
  tracker: () => "/tracker",
  settings: () => "/settings",
};

/** Gives every @korra/ui screen in the app shell the server-action adapter and Next.js navigation. */
export function WebProviders({ children }: { children: ReactNode }) {
  const router = useRouter();
  const nav = useMemo<KorraNav>(
    () => ({ Link: WebLink, push: (href) => router.push(href), refresh: () => router.refresh(), hrefs: webHrefs }),
    [router],
  );
  return <KorraProvider api={serverApi} nav={nav}>{children}</KorraProvider>;
}

/** A CA's read-only view of one client: same screens, links stay under /ca/[ownerId]. */
export function ClientNav({ ownerId, children }: { ownerId: string; children: ReactNode }) {
  const parent = useNav();
  const base = `/ca/${ownerId}`;
  const nav = useMemo<KorraNav>(
    () => ({
      ...parent,
      hrefs: {
        ...parent.hrefs,
        home: () => base,
        month: (month) => `${base}/months/${month}`,
        pack: (packId) => `${base}/packs/${packId}`,
        tracker: () => `${base}/tracker`,
      },
    }),
    [parent, base],
  );
  return <NavProvider nav={nav}>{children}</NavProvider>;
}
