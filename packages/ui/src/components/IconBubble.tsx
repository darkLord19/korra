import { cx } from "./cx";

type Tone = "accent" | "flag" | "danger" | "ok";
const tones: Record<Tone, string> = {
  accent: "bg-accent-soft",
  flag: "bg-flag-soft",
  danger: "bg-danger-soft",
  ok: "bg-ok-soft",
};

/** An emoji in a tinted rounded square. The emoji is decoration; put the meaning in text next to it. */
export function IconBubble({ icon, tone = "accent" }: { icon: string; tone?: Tone }) {
  return (
    <span className={cx("inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-2xl", tones[tone])}>
      <span aria-hidden="true">{icon}</span>
    </span>
  );
}
