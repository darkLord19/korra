import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cx } from "./cx";

const base = "block min-h-11 w-full rounded-xl border border-line bg-surface px-3.5 py-2 text-base text-ink md:text-sm placeholder:text-muted aria-[invalid=true]:border-danger";

export function Input({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx(base, className)} {...rest} />;
}
export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx(base, className)} {...rest} />;
}
export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx(base, className)} {...rest} />;
}
