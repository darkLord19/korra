import { describe, expect, it } from "vitest";
import { BANK_CATALOG, findCatalogBank, findCatalogBankByIfsc, findCatalogBankInName } from "./banks";

describe("bank catalog", () => {
  it("keeps the names the pack layout detection looks for, with unique keys", () => {
    expect(BANK_CATALOG).toHaveLength(10);
    expect(new Set(BANK_CATALOG.map((b) => b.key)).size).toBe(10);
    for (const w of ["hdfc", "icici", "axis"]) expect(BANK_CATALOG.some((b) => b.name.toLowerCase().includes(w))).toBe(true);
  });
  it("suggests an AD code only for ICICI", () => {
    expect(BANK_CATALOG.filter((b) => b.adCodeHint).map((b) => [b.name, b.adCodeHint])).toEqual([["ICICI Bank", "6390002"]]);
  });
  it("finds an entry by name, ignoring case and spaces", () => {
    expect(findCatalogBank("  hdfc BANK ")?.key).toBe("hdfc");
    expect(findCatalogBank("HDFC")).toBeUndefined();
    expect(findCatalogBank("")).toBeUndefined();
  });
  it("maps an IFSC to its bank by the 4-letter prefix, for the ten catalog banks only", () => {
    const keys = Object.fromEntries(["HDFC0001234", "ICIC0000001", "UTIB0000123", "SBIN0001234", "KKBK0000123", "YESB0000001", "IDFB0010101", "INDB0000123", "BARB0BANGAL", "PUNB0123400"].map((i) => [i, findCatalogBankByIfsc(i)?.key]));
    expect(keys).toEqual({ HDFC0001234: "hdfc", ICIC0000001: "icici", UTIB0000123: "axis", SBIN0001234: "sbi", KKBK0000123: "kotak", YESB0000001: "yes", IDFB0010101: "idfc-first", INDB0000123: "indusind", BARB0BANGAL: "bob", PUNB0123400: "pnb" });
    expect(findCatalogBankByIfsc("hdfc0001234")?.key).toBe("hdfc");
    expect(findCatalogBankByIfsc("FDRL0001234")).toBeUndefined(); // Federal Bank is not in the catalog
    expect(findCatalogBankByIfsc("")).toBeUndefined();
  });
  it("finds a bank in a printed name, on whole words", () => {
    expect(findCatalogBankInName("HDFC Bank Ltd.")?.key).toBe("hdfc");
    expect(findCatalogBankInName("Kotak Mahindra Bank Limited, Indiranagar")?.key).toBe("kotak");
    expect(findCatalogBankInName("State Bank of India")?.key).toBe("sbi");
    expect(findCatalogBankInName("HDFC")).toBeUndefined();
    expect(findCatalogBankInName("Federal Bank")).toBeUndefined();
    expect(findCatalogBankInName("Eyes Bank")).toBeUndefined();
  });
});
