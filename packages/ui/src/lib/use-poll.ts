"use client";
import { useEffect, useRef } from "react";

/** Calls `fn` every `ms` while `active`. */
export function usePoll(active: boolean, fn: () => void, ms = 3000): void {
  const latest = useRef(fn);
  latest.current = fn;
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => latest.current(), ms);
    return () => clearInterval(t);
  }, [active, ms]);
}
