import { describe, expect, it } from "vitest";
import { PACKAGE } from "./index";

describe("@korra/ingest", () => {
  it("loads (server-only is stubbed under vitest)", () => {
    expect(PACKAGE).toBe("@korra/ingest");
  });
});
