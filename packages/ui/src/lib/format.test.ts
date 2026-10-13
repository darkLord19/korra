import { describe, expect, it } from "vitest";
import { greetingName, midSentence } from "./format";

describe("greetingName", () => {
  it("title-cases the first word of the legal name", () => {
    expect(greetingName("JANE DEV CONSULTING")).toBe("Jane");
    expect(greetingName("  jane dev ")).toBe("Jane");
    expect(greetingName("Jane Dev Consulting")).toBe("Jane");
    expect(greetingName("MARY-ANN SHAH")).toBe("Mary-ann");
  });
  it("keeps a word that already mixes cases, and drops trailing punctuation", () => {
    expect(greetingName("McDonald Design")).toBe("McDonald");
    expect(greetingName("ACME, INC.")).toBe("Acme");
  });
  it("has no name when there is none, or the first word is only a company suffix", () => {
    expect(greetingName(null)).toBeNull();
    expect(greetingName("  ")).toBeNull();
    expect(greetingName("PVT LTD")).toBeNull();
    expect(greetingName("LLP Partners")).toBeNull();
    expect(greetingName("M/s Jane Traders")).toBeNull();
  });
});

describe("midSentence", () => {
  it("lowercases an ordinary label and keeps acronyms", () => {
    expect(midSentence("Invoice number")).toBe("invoice number");
    expect(midSentence("SAC code")).toBe("SAC code");
    expect(midSentence("AD bank")).toBe("AD bank");
    expect(midSentence("FX rate")).toBe("FX rate");
    expect(midSentence("INR credited")).toBe("INR credited");
  });
});
