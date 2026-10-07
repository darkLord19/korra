import { describe, expect, it } from "vitest";
import { BANK_CATALOG, findCatalogBank } from "./banks";

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
});
