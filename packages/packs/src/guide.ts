import type { YearMonth } from "@korra/core";
import type { Layout } from "./layouts";
import { dueDateFor, monthLabel } from "./util";

export function renderGuide(layout: Layout, bankName: string, month: YearMonth): string {
  const vars: Record<string, string> = { bank: bankName, month: monthLabel(month), dueDate: dueDateFor(month) };
  return layout.guide.replace(/\{(bank|month|dueDate)\}/g, (_, k: string) => vars[k] ?? "");
}
