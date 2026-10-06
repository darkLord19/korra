import { describe, expect, it } from "vitest";
import { addMoney, formatMoney, money, moneyFromJSON, moneyToJSON, subMoney } from "./money";

describe("money", () => {
  it("constructs from number, string and bigint", () => {
    expect(money(100, "USD")).toEqual({ minor: 100n, currency: "USD" });
    expect(money("100", "USD")).toEqual({ minor: 100n, currency: "USD" });
    expect(money(100n, "USD").minor).toBe(100n);
  });
  it("rejects fractional minor units", () => {
    expect(() => money(1.5, "USD")).toThrow();
  });
  it("adds and subtracts same-currency amounts", () => {
    expect(addMoney(money(150, "USD"), money(50, "USD"))).toEqual(money(200, "USD"));
    expect(subMoney(money(150, "USD"), money(200, "USD"))).toEqual(money(-50, "USD"));
  });
  it("throws on currency mismatch", () => {
    expect(() => addMoney(money(1, "USD"), money(1, "EUR"))).toThrow(/mismatch/);
    expect(() => subMoney(money(1, "USD"), money(1, "EUR"))).toThrow(/mismatch/);
  });
  it("formats with grouping and exponent", () => {
    expect(formatMoney(money(123450, "USD"))).toBe("USD 1,234.50");
    expect(formatMoney(money(5, "USD"))).toBe("USD 0.05");
    expect(formatMoney(money(-123456789, "INR"))).toBe("INR -1,234,567.89");
    expect(formatMoney(money(1000, "JPY"))).toBe("JPY 1,000");
  });
  it("round-trips through JSON as strings", () => {
    const big = money(9007199254740993123n, "USD");
    const json = moneyToJSON(big);
    expect(json).toEqual({ minor: "9007199254740993123", currency: "USD" });
    expect(moneyFromJSON(JSON.parse(JSON.stringify(json)))).toEqual(big);
  });
});
