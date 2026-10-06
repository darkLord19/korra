import { z } from "zod";
import generic1 from "../layouts/generic@1.json";
import icici0 from "../layouts/icici@0.json";
import hdfc0 from "../layouts/hdfc@0.json";
import axis0 from "../layouts/axis@0.json";
import declGeneric1 from "../layouts/declaration-generic@1.json";
import declIcici0 from "../layouts/declaration-icici@0.json";
import declHdfc0 from "../layouts/declaration-hdfc@0.json";
import declAxis0 from "../layouts/declaration-axis@0.json";

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

/** Keys of a DeclarationRow (evidence flattened). Money fields render as a number (major units). */
export const DECLARATION_COLUMN_KEYS = [
  "invoiceNo",
  "invoiceDate",
  "edfMonth",
  "clientName",
  "currency",
  "invoiceAmount",
  "inrEquivalent",
  "realisedAmount",
  "status",
  "paymentDates",
  "references",
  "receiptModes",
] as const;
export type DeclarationColumnKey = (typeof DECLARATION_COLUMN_KEYS)[number];

export type LayoutKind = "edf" | "declaration";

const common = {
  id: z.string().min(1),
  version: z.string().min(1),
  bankName: z.string().min(1),
  placeholder: z.boolean(),
  guide: z.string().min(1),
};

/** `kind` defaults to "edf" so the original EDF layout files stay valid unchanged. */
export const edfLayoutSchema = z.object({
  ...common,
  kind: z.literal("edf").default("edf"),
  columns: z.array(z.object({ header: z.string().min(1), key: z.enum(COLUMN_KEYS) })).min(1),
});
export const declarationLayoutSchema = z.object({
  ...common,
  kind: z.literal("declaration"),
  columns: z.array(z.object({ header: z.string().min(1), key: z.enum(DECLARATION_COLUMN_KEYS) })).min(1),
});
export const layoutSchema = z.union([edfLayoutSchema, declarationLayoutSchema]);
export type EdfLayout = z.infer<typeof edfLayoutSchema>;
export type DeclarationLayout = z.infer<typeof declarationLayoutSchema>;
/** Kept as the EDF layout for existing callers. */
export type Layout = EdfLayout;
export type AnyLayout = EdfLayout | DeclarationLayout;

export class LayoutNotFoundError extends Error {
  readonly layoutId: string;
  constructor(layoutId: string) {
    super(`Unknown pack layout: ${layoutId}`);
    this.name = "LayoutNotFoundError";
    this.layoutId = layoutId;
  }
}

// Static imports so the JSON is bundled (no fs at runtime). Add new layout files here.
const RAW: unknown[] = [generic1, icici0, hdfc0, axis0, declGeneric1, declIcici0, declHdfc0, declAxis0];

const LAYOUTS: AnyLayout[] = RAW.map((r) => layoutSchema.parse(r));

function find<K extends LayoutKind>(id: string, kind: K): Extract<AnyLayout, { kind: K }> {
  const found = LAYOUTS.find((l) => l.id === id && l.kind === kind);
  if (!found) throw new LayoutNotFoundError(id);
  return found as Extract<AnyLayout, { kind: K }>;
}

/** An EDF pack layout. Throws LayoutNotFoundError for unknown ids and for declaration layouts. */
export function getLayout(id: string): EdfLayout {
  return find(id, "edf");
}

export function getDeclarationLayout(id: string): DeclarationLayout {
  return find(id, "declaration");
}

/** Lists layouts of one kind; `kind` defaults to "edf" so existing callers are unchanged. */
export function listLayouts(
  kind: LayoutKind = "edf",
): { id: string; bankName: string; version: string; placeholder: boolean; kind: LayoutKind }[] {
  return LAYOUTS.filter((l) => l.kind === kind).map(({ id, bankName, version, placeholder, kind: k }) => ({
    id,
    bankName,
    version,
    placeholder,
    kind: k,
  }));
}
