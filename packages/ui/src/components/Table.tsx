import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from "react";
import { cx } from "./cx";

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto">
      <table className={cx("w-full border-collapse text-left text-sm", className)} {...rest} />
    </div>
  );
}
export const Th = ({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th scope="col" className={cx("border-b border-line px-3 py-2 text-xs font-medium whitespace-nowrap text-muted", className)} {...rest} />
);
export const Td = ({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cx("border-b border-line px-3 py-2 align-top", className)} {...rest} />
);
