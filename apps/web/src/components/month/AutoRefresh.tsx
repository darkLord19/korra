"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Re-fetches the server component tree every `ms` while `active` (documents still being read). */
export function AutoRefresh({ active, ms = 3000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), ms);
    return () => clearInterval(t);
  }, [active, ms, router]);
  return null;
}
