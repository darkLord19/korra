import { useSyncExternalStore } from "react";

/**
 * Whether a media query matches. False on the server, on the first client render, and where `matchMedia` is missing,
 * so a layout that only exists on wide screens is simply not mounted elsewhere.
 */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      if (typeof matchMedia !== "function") return () => undefined;
      const mq = matchMedia(query);
      mq.addEventListener("change", notify);
      return () => mq.removeEventListener("change", notify);
    },
    () => typeof matchMedia === "function" && matchMedia(query).matches,
    () => false,
  );
}
