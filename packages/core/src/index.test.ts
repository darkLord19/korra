import { describe, expect, it } from "vitest";
import { FLAG_THRESHOLD, REQUIRED_FIELDS } from "./index";

describe("@korra/core", () => {
  it("exports shared constants", () => {
    expect(FLAG_THRESHOLD).toBe(0.9);
    expect(REQUIRED_FIELDS.payment).not.toContain("firaRef");
  });
});
