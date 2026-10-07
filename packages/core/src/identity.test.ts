import { describe, expect, it } from "vitest";
import { GSTIN_RE, PAN_RE, panFromGstin } from "./identity";

describe("panFromGstin", () => {
  it("takes characters 3 to 12 of a full GSTIN", () => {
    expect(panFromGstin("29ABCDE1234F1Z5")).toBe("ABCDE1234F");
    expect(panFromGstin("07AAACG2115R1ZN")).toBe("AAACG2115R");
  });
  it("ignores case and outer spaces", () => {
    expect(panFromGstin("  29abcde1234f1z5 ")).toBe("ABCDE1234F");
  });
  it("is null for anything that is not a full GSTIN", () => {
    for (const bad of ["", "29ABCDE1234F1Z", "29ABCDE1234F1Z55", "29ABCDE1234F1X5", "AAABCDE1234F1Z5", "29ABCDE12345F1Z5", "29ABCDE1234F 1Z5"]) {
      expect(panFromGstin(bad), bad).toBeNull();
    }
  });
  it("what it returns is a well-formed PAN", () => {
    expect(PAN_RE.test(panFromGstin("29ABCDE1234F1Z5")!)).toBe(true);
    expect(GSTIN_RE.test("29ABCDE1234F1Z5")).toBe(true);
  });
});
