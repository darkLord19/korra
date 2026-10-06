import type { YearMonth } from "@korra/core";
import type { Layout } from "./layouts";
import { edfDueDate } from "@korra/core";
import { monthLabel } from "./util";

export function renderGuide(layout: Layout, bankName: string, month: YearMonth): string {
  const vars: Record<string, string> = { bank: bankName, month: monthLabel(month), dueDate: edfDueDate(month) };
  return layout.guide.replace(/\{(bank|month|dueDate)\}/g, (_, k: string) => vars[k] ?? "");
}
