import { cx } from "./cx";

/** Where you are in a flow. `index` is 0-based. */
export function ProgressDots({ index, total }: { index: number; total: number }) {
  return (
    <div role="img" aria-label={`Step ${index + 1} of ${total}`} className="flex items-center gap-1.5">
      {Array.from({ length: total }, (_, i) => (
        <span key={i} aria-hidden="true" className={cx("h-2 rounded-full transition-all", i === index ? "w-5 bg-accent" : i < index ? "w-2 bg-accent/60" : "w-2 bg-line")} />
      ))}
    </div>
  );
}
