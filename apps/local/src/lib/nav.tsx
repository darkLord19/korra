"use client";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { KorraProvider, type KorraApi, type KorraNav, type NavLinkProps } from "@korra/ui";

const LocalLink = (props: NavLinkProps) => <NextLink {...props} />;

/**
 * Every page is client-rendered, so routes carry their data in the query string instead of dynamic segments:
 * /home?task=..., /months?m=YYYY-MM and /pack?id=...
 */
export const localHrefs: KorraNav["hrefs"] = {
  landing: () => "/",
  home: () => "/home",
  task: (id) => `/home?task=${encodeURIComponent(id)}`,
  months: () => "/months",
  month: (month) => `/months?m=${encodeURIComponent(month)}`,
  pack: (packId) => `/pack?id=${encodeURIComponent(packId)}`,
  settings: () => "/settings",
};

/** The local `KorraNav`. `refresh` has nothing to re-fetch: nothing is rendered on a server. */
export function useLocalNav(): KorraNav {
  const router = useRouter();
  return useMemo<KorraNav>(() => ({ Link: LocalLink, push: (href) => router.push(href), refresh: () => undefined, hrefs: localHrefs }), [router]);
}

/** Gives the @korra/ui screens below it the local adapter and Next.js client navigation. */
export function LocalProviders({ api, children }: { api: KorraApi; children: ReactNode }) {
  return <KorraProvider api={api} nav={useLocalNav()}>{children}</KorraProvider>;
}
