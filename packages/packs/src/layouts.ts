import { z } from "zod";
import generic1 from "../layouts/generic@1.json";
import icici0 from "../layouts/icici@0.json";
import hdfc0 from "../layouts/hdfc@0.json";
import axis0 from "../layouts/axis@0.json";

/** Paths into an EdfRow. Money fields render as a number (major units); `.currency` as its code. */
export const COLUMN_KEYS = [
  "exporterLegalName",
  "exporterAddress",
  "exporterPan",
  "exporterGstin",
  "exporterIec",
  "invoiceNo",
  "invoiceDate",
  "clientName",
  "clientAddress",
  "clientCountry",
  "invoiceAmount",
  "invoiceAmount.currency",
  "netRealisableValue",
  "netRealisableValue.currency",
  "contractRef",
  "serviceDescription",
  "sacCode",
] as const;
export type ColumnKey = (typeof COLUMN_KEYS)[number];

export const layoutSchema = z.object({
  id: z.string().min(1),
  version: z.string().min(1),
  bankName: z.string().min(1),
  placeholder: z.boolean(),
  columns: z.array(z.object({ header: z.string().min(1), key: z.enum(COLUMN_KEYS) })).min(1),
  guide: z.string().min(1),
});
export type Layout = z.infer<typeof layoutSchema>;

export class LayoutNotFoundError extends Error {
  readonly layoutId: string;
  constructor(layoutId: string) {
    super(`Unknown pack layout: ${layoutId}`);
    this.name = "LayoutNotFoundError";
    this.layoutId = layoutId;
  }
}

// Static imports so the JSON is bundled (no fs at runtime). Add new layout files here.
const RAW: unknown[] = [generic1, icici0, hdfc0, axis0];

const LAYOUTS: Layout[] = RAW.map((r) => layoutSchema.parse(r));

export function getLayout(id: string): Layout {
  const found = LAYOUTS.find((l) => l.id === id);
  if (!found) throw new LayoutNotFoundError(id);
  return found;
}

export function listLayouts(): { id: string; bankName: string; version: string; placeholder: boolean }[] {
  return LAYOUTS.map(({ id, bankName, version, placeholder }) => ({ id, bankName, version, placeholder }));
}
