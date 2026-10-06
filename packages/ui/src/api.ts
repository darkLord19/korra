/**
 * The seam between the shared screens and an app. Every owner-facing use-case, with wire types in and out.
 * Adapters: `apps/web` calls server actions, `apps/local` calls the use-cases in the browser.
 *
 * Types only from `@korra/backend/schemas` and `@korra/core`. Adapters report failures by throwing a
 * `KorraApiError`; the screens render it.
 */
import type {
  AdBankWire,
  ConfirmAllFieldsInput,
  ConfirmAllFieldsResult,
  CreateInvoiceManuallyInput,
  CreatePaymentManuallyInput,
  DecideAllocationInput,
  DocumentWire,
  EditFieldInput,
  ExporterProfileWire,
  GeneratePackResult,
  ManualEntryResult,
  MonthStateWire,
  OnboardingWire,
  PackDownloadsWire,
  PackWire,
  RequestUploadInput,
  SaveBankInput,
  SaveProfileInput,
  TrackerWire,
} from "@korra/backend/schemas";

export type UploadHint = NonNullable<RequestUploadInput["hint"]>;

export interface KorraCapabilities {
  /** The app can share records with a CA (a "Share with my CA" panel is meaningful). */
  caSharing: boolean;
  /** How "delete everything" works: on a server (account deletion) or by wiping this browser's data. */
  accountDeletion: "server" | "local";
  /** The app can back up and restore the user's data to a file. */
  backup: boolean;
}

/** `getPackDownloads` result. `guideText` is the submission guide when the adapter already has it; otherwise the screen fetches the guide file's `url`. */
export type PackDownloads = PackDownloadsWire & { guideText?: string | null };

export interface KorraApi {
  readonly capabilities: KorraCapabilities;

  getOnboarding(): Promise<OnboardingWire>;
  saveProfile(input: SaveProfileInput): Promise<ExporterProfileWire>;
  saveBank(input: SaveBankInput): Promise<AdBankWire>;

  getMonthState(month: string): Promise<MonthStateWire>;
  /**
   * Stores a file for `month` and schedules reading it (request upload, transfer, confirm, ingest: each adapter
   * implements its own transport). `hint` "ack" stores a bank acknowledgement without reading it.
   * Resolves once the file is stored and ingest is scheduled, not when ingest finishes: poll `getMonthState`.
   */
  uploadFile(file: File, opts: { month: string; hint?: UploadHint }): Promise<{ documentId: string }>;
  listDocuments(month?: string): Promise<DocumentWire[]>;

  editField(input: EditFieldInput): Promise<void>;
  decideAllocation(input: DecideAllocationInput): Promise<void>;
  linkNoc(input: { paymentId: string; documentId: string }): Promise<void>;
  createInvoiceManually(input: CreateInvoiceManuallyInput): Promise<ManualEntryResult>;
  createPaymentManually(input: CreatePaymentManuallyInput): Promise<ManualEntryResult>;
  /** "I've checked these": marks every non-empty field of the invoice or payment as confirmed by the user. */
  confirmAllFields(input: ConfirmAllFieldsInput): Promise<ConfirmAllFieldsResult>;

  generatePack(input: { month: string; adBankId: string }): Promise<GeneratePackResult>;
  getPackDownloads(packId: string): Promise<PackDownloads>;
  /** Upload the acknowledgement first with `uploadFile(file, { month, hint: "ack" })` and pass its documentId. */
  markPackSubmitted(input: { packId: string; ackDocumentId?: string }): Promise<PackWire>;
  listPacks(month?: string): Promise<PackWire[]>;

  getTracker(): Promise<TrackerWire>;
}
