import { describe, expect, it } from "vitest";
import { ForbiddenError, NotFoundError, UNKNOWN_ERROR, UnauthenticatedError, ValidationError, toWireError } from "./index";
import { GENERIC_ERROR_MESSAGE, isGuideFile, parseFieldErrors } from "./wire-values";

describe("toWireError (shared by the server actions and the in-browser adapter)", () => {
  it("classifies a ValidationError and parses 'field: msg; field: msg' into fieldErrors", () => {
    expect(toWireError(new ValidationError("legalName: Required; pan: Invalid PAN"))).toEqual({
      kind: "validation",
      message: "legalName: Required; pan: Invalid PAN",
      fieldErrors: { legalName: "Required", pan: "Invalid PAN" },
    });
  });

  it("keeps only the first path segment of a field and omits fieldErrors when none parse", () => {
    expect(toWireError(new ValidationError("amount.minor: Too small"))).toMatchObject({ fieldErrors: { amount: "Too small" } });
    expect(toWireError(new ValidationError("The file has not finished uploading. Try again."))).toEqual({
      kind: "validation",
      message: "The file has not finished uploading. Try again.",
    });
  });

  it("classifies not found, unauthenticated and forbidden with the fixed messages", () => {
    expect(toWireError(new NotFoundError("AD bank not found"))).toEqual({ kind: "not_found", message: "AD bank not found" });
    expect(toWireError(new UnauthenticatedError())).toEqual({ kind: "unauthenticated", message: "Sign in to continue." });
    expect(toWireError(new ForbiddenError("nope"))).toEqual({ kind: "forbidden", message: "You have read-only access to this account." });
  });

  it("returns null for anything that is not a domain error", () => {
    expect(toWireError(new Error("boom"))).toBeNull();
    expect(toWireError("x")).toBeNull();
    expect(toWireError(null)).toBeNull();
    expect(UNKNOWN_ERROR).toEqual({ kind: "unknown", message: GENERIC_ERROR_MESSAGE });
  });
});

describe("wire helpers", () => {
  it("parseFieldErrors ignores parts whose prefix is not a field name, i.e. not 'field: message'", () => {
    expect(parseFieldErrors("The file is too big: really; ok: fine")).toEqual({ ok: "fine" });
    expect(parseFieldErrors("")).toEqual({});
  });

  it("isGuideFile matches the submission guides only", () => {
    expect(isGuideFile({ name: "HOW-TO-SUBMIT-generic-bank.md" })).toBe(true);
    expect(isGuideFile({ name: "EDF-generic-bank-2026-09.pdf" })).toBe(false);
  });
});
