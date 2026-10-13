import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink font-bold hover:opacity-90 border border-transparent",
  secondary: "bg-surface text-ink border border-line hover:bg-accent-soft",
  ghost: "bg-transparent text-accent border border-transparent hover:bg-accent-soft",
  danger: "bg-surface text-danger border border-danger hover:bg-danger-soft",
};

const sizes: Record<Size, string> = {
  sm: "min-h-11 px-3.5 py-1.5 text-sm md:min-h-9",
  md: "min-h-11 px-5 py-2 text-sm",
  lg: "min-h-14 px-7 py-3 text-base",
};

/** Pills, 44px tall on touch screens. `lg` is for sticky, primary actions. */
export function buttonClass(variant: Variant = "primary", size: Size = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-full font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    sizes[size],
    variants[variant],
  );
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={cx(buttonClass(variant, size), className)} {...rest} />;
}
