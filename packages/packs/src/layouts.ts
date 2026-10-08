import { z } from "zod";
import generic1 from "../layouts/generic@1.json";
import icici0 from "../layouts/icici@0.json";
import hdfc1 from "../layouts/hdfc@1.json";
import axis0 from "../layouts/axis@0.json";

import generic2 from "../layouts/generic@2.json";
import hdfc2 from "../layouts/hdfc@2.json";
import icici1 from "../layouts/icici@1.json";
import axis1 from "../layouts/axis@1.json";
import sbi0 from "../layouts/sbi@0.json";
import kotak0 from "../layouts/kotak@0.json";
import yes0 from "../layouts/yes@0.json";
import idfcFirst0 from "../layouts/idfc-first@0.json";
import indusind0 from "../layouts/indusind@0.json";
import bob0 from "../layouts/bob@0.json";
import pnb0 from "../layouts/pnb@0.json";

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
  /** 1-based row number (not part of EdfRow). */
  "serialNo",
  /** Recipient name and address in one cell. */
  "clientNameAndAddress",
  /** Free-text remarks: EdfRow has no data for it, so it renders empty. */
  "remarks",
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

export const submissionChannelSchema = z.object({
  kind: z.enum(["netbanking", "email", "branch"]),
  title: z.string().min(1),
  steps: z.array(z.string().min(1)),
  links: z.array(
    z.object({
      label: z.string().min(1),
      url: z.string().url().refine((u) => u.startsWith("https://"), { message: "Link URL must start with https://" }),
    }),
  ),
  verified: z.boolean(),
});

export const submissionSchema = z.object({
  documents: z.array(z.string().min(1)),
  signing: z.object({
    wetSignature: z.boolean().nullable(),
    seal: z.boolean().nullable(),
    scannedOk: z.boolean().nullable(),
    dscOk: z.boolean().nullable(),
    note: z.string().optional(),
  }),
  channels: z.array(submissionChannelSchema),
  email: z
    .object({
      subject: z.string().min(1),
      intro: z.string().min(1),
    })
    .optional(),
  sources: z.array(
    z.object({
      url: z.string().url().refine((u) => u.startsWith("https://"), { message: "Source URL must start with https://" }),
      retrievedAt: z.string(),
    }),
  ),
});
export type Submission = z.infer<typeof submissionSchema>;
export type SubmissionChannel = z.infer<typeof submissionChannelSchema>;

const common = {
  id: z.string().min(1),
  version: z.string().min(1),
  bankName: z.string().min(1),
  placeholder: z.boolean(),
  guide: z.string().optional(),
};

export const PDF_STYLES = ["table", "hdfc-letter", "rbi-annex"] as const;

/** `kind` defaults to "edf" so the original EDF layout files stay valid unchanged. */
export const edfLayoutSchema = z.object({
  ...common,
  kind: z.literal("edf").default("edf"),
  /** How the PDF is drawn: the generic table, or a bank's own request-letter structure, or statutory RBI Annex. */
  pdfStyle: z.enum(PDF_STYLES).default("table"),
  columns: z.array(z.object({ header: z.string().min(1), key: z.enum(COLUMN_KEYS) })).min(1),
  submission: submissionSchema.optional(),
});
export const declarationLayoutSchema = z.object({
  ...common,
  kind: z.literal("declaration"),
  guide: z.string().min(1),
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
const RAW: unknown[] = [
  generic1,
  icici0,
  hdfc1,
  axis0,
  generic2,
  hdfc2,
  icici1,
  axis1,
  sbi0,
  kotak0,
  yes0,
  idfcFirst0,
  indusind0,
  bob0,
  pnb0,
  declGeneric1,
  declIcici0,
  declHdfc0,
  declAxis0,
];

const LAYOUTS: AnyLayout[] = RAW.map((r) => layoutSchema.parse(r));

function find<K extends LayoutKind>(id: string, kind: K): Extract<AnyLayout, { kind: K }> {
  // If id is explicitly versioned (e.g. "hdfc@1", "hdfc@2")
  if (id.includes("@")) {
    const [baseId, version] = id.split("@");
    const found = LAYOUTS.find((l) => l.id === baseId && l.version === version && l.kind === kind);
    if (found) return found as Extract<AnyLayout, { kind: K }>;
  }
  // Otherwise find matching layout with highest version number
  const matches = LAYOUTS.filter((l) => l.id === id && l.kind === kind);
  if (matches.length > 0) {
    matches.sort((a, b) => Number(b.version) - Number(a.version));
    return matches[0] as Extract<AnyLayout, { kind: K }>;
  }
  throw new LayoutNotFoundError(id);
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
  const latest = new Map<string, AnyLayout>();
  for (const l of LAYOUTS) {
    if (l.kind !== kind) continue;
    const existing = latest.get(l.id);
    if (!existing || Number(l.version) > Number(existing.version)) {
      latest.set(l.id, l);
    }
  }
  return [...latest.values()].map(({ id, bankName, version, placeholder, kind: k }) => ({
    id,
    bankName,
    version,
    placeholder,
    kind: k,
  }));
}
