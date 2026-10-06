import { describe, expect, it } from "vitest";
import { isPlaceholderLayout, layoutIdFor } from "./packs";

describe("placeholder layouts", () => {
  it("flags bank-specific layouts but not the generic one", () => {
    expect(isPlaceholderLayout(layoutIdFor("ICICI Bank"))).toBe(true);
    expect(isPlaceholderLayout(layoutIdFor("Some Co-operative Bank"))).toBe(false);
    expect(isPlaceholderLayout("nope")).toBe(false);
  });
});
