import type { ReactNode } from "react";
import type { InvoiceWire, MonthStateWire } from "@korra/backend/schemas";
import { KorraProvider, type KorraNav, type NavLinkProps } from "./context";
import type { KorraApi, KorraCapabilities } from "./api";

export const field = <T,>(value: T | null, confidence = 1, source: "extracted" | "user" | "default" = "extracted") => ({ value, confidence, source });
const usd = (minor: string) => ({ minor, currency: "USD" });

export function invoice(over: Partial<InvoiceWire> = {}): InvoiceWire {
  return {
    id: "inv1",
    documentId: "doc1",
    invoiceNo: field("INV-1"),
    invoiceDate: field("2026-09-02"),
    clientName: field("Acme Corp"),
    clientAddress: field("1 Main St"),
    clientCountry: field("US"),
    amount: field(usd("150000")),
    netRealisableValue: field(usd("150000")),
    inrEquivalent: field(null, 0, "default"),
    contractRef: field(null, 0, "default"),
    serviceDescription: field("Software development"),
    sacCode: field("998314", 0.6),
    adBankId: field("bank1", 1, "default"),
    ...over,
  };
}

export function monthState(over: Partial<MonthStateWire> = {}): MonthStateWire {
  return {
    month: "2026-09",
    documents: [],
    invoices: [],
    payments: [],
    allocations: [],
    realisations: {},
    blockersByBank: [],
    pendingDocumentIds: [],
    lastSacCode: null,
    ...over,
  };
}

const unused = (name: string) => () => Promise.reject(new Error(`fake api: ${name} not stubbed`));

/** A KorraApi where every method rejects unless overridden. Methods are vi.fn-friendly plain functions. */
export function fakeApi(over: Partial<KorraApi> = {}, capabilities: Partial<KorraCapabilities> = {}): KorraApi {
  return {
    capabilities: { caSharing: true, accountDeletion: "server", backup: false, ...capabilities },
    getOnboarding: unused("getOnboarding"),
    saveProfile: unused("saveProfile"),
    saveBank: unused("saveBank"),
    extractProfileFromInvoice: unused("extractProfileFromInvoice"),
    getMonthState: unused("getMonthState"),
    uploadFile: unused("uploadFile"),
    listDocuments: unused("listDocuments"),
    editField: unused("editField"),
    decideAllocation: unused("decideAllocation"),
    linkNoc: unused("linkNoc"),
    createInvoiceManually: unused("createInvoiceManually"),
    createPaymentManually: unused("createPaymentManually"),
    confirmAllFields: unused("confirmAllFields"),
    generatePack: unused("generatePack"),
    getPackDownloads: unused("getPackDownloads"),
    markPackSubmitted: unused("markPackSubmitted"),
    listPacks: unused("listPacks"),
    getTracker: unused("getTracker"),
    ...over,
  };
}

export const testNav: KorraNav = {
  Link: ({ href, ...rest }: NavLinkProps) => <a href={href} {...rest} />,
  push: () => undefined,
  refresh: () => undefined,
  hrefs: {
    home: () => "/",
    onboarding: () => "/onboarding",
    month: (m) => `/months/${m}`,
    pack: (id) => `/packs/${id}`,
    tracker: () => "/tracker",
    settings: () => "/settings",
  },
};

export function Wrap({ api, nav = testNav, children }: { api: KorraApi; nav?: KorraNav; children: ReactNode }) {
  return <KorraProvider api={api} nav={nav}>{children}</KorraProvider>;
}
