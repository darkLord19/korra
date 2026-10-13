import { cx } from "./cx";

/** A pulsing placeholder block while data loads. Size it with `className`. */
export function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cx("rounded-xl bg-surface-soft motion-safe:animate-pulse", className)} />;
}
