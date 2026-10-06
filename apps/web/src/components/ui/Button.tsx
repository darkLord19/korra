import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

type Variant = "primary" | "secondary" | "ghost" | "danger";
const variants: Record<Variant, string> = {
  primary: "bg-accent text-accent-ink hover:opacity-90 border border-transparent",
  secondary: "bg-surface text-ink border border-line hover:bg-accent-soft",
  ghost: "bg-transparent text-accent border border-transparent hover:bg-accent-soft",
  danger: "bg-surface text-danger border border-danger hover:bg-danger-soft",
};

export function buttonClass(variant: Variant = "primary", size: "sm" | "md" = "md") {
  return cx(
    "inline-flex items-center justify-center gap-2 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
    size === "sm" ? "px-2.5 py-1 text-sm" : "px-4 py-2 text-sm",
    variants[variant],
  );
}

export function Button({ variant = "primary", size = "md", className, type = "button", ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md" }) {
  return <button type={type} className={cx(buttonClass(variant, size), className)} {...rest} />;
}
