"use client";
import NextLink from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { KorraProvider, type KorraApi, type KorraNav, type NavLinkProps } from "@korra/ui";

const LocalLink = (props: NavLinkProps) => <NextLink {...props} />;

/**
 * Every page is client-rendered, so routes carry their data in the query string instead of dynamic segments:
 * /month?m=YYYY-MM and /pack?id=...
 */
export const localHrefs: KorraNav["hrefs"] = {
  home: () => "/",
  onboarding: () => "/onboarding",
  month: (month) => `/month?m=${encodeURIComponent(month)}`,
  pack: (packId) => `/pack?id=${encodeURIComponent(packId)}`,
  tracker: () => "/tracker",
  settings: () => "/settings",
};

/** Gives the @korra/ui screens below it the local adapter and Next.js client navigation. */
export function LocalProviders({ api, children }: { api: KorraApi; children: ReactNode }) {
  const router = useRouter();
  // `refresh` has nothing to re-fetch: nothing is rendered on a server.
  const nav = useMemo<KorraNav>(() => ({ Link: LocalLink, push: (href) => router.push(href), refresh: () => undefined, hrefs: localHrefs }), [router]);
  return <KorraProvider api={api} nav={nav}>{children}</KorraProvider>;
}
