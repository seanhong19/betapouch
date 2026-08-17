import { describe, expect, it } from "vitest";
import { currencyExponent, formatMoney, minorToDecimalString, parseAmountToMinor } from "./money.js";

describe("parseAmountToMinor", () => {
  it("parses plain decimals", () => {
    expect(parseAmountToMinor("12.34")).toBe(1234);
    expect(parseAmountToMinor("0.05")).toBe(5);
    expect(parseAmountToMinor("7")).toBe(700);
  });

  it("strips currency symbols and spaces", () => {
    expect(parseAmountToMinor("$1,234.56")).toBe(123456);
    expect(parseAmountToMinor("  £ 42.50 ")).toBe(4250);
  });

  it("handles European separators", () => {
    expect(parseAmountToMinor("1.234,56")).toBe(123456);
    expect(parseAmountToMinor("1,50")).toBe(150);
  });

  it("treats a 3-digit group after a comma as thousands", () => {
    expect(parseAmountToMinor("1,500")).toBe(150000);
  });

  it("respects zero-decimal currencies", () => {
    expect(parseAmountToMinor("1,250", "JPY")).toBe(1250);
    expect(currencyExponent("JPY")).toBe(0);
    expect(currencyExponent("KWD")).toBe(3);
  });

  it("keeps negatives", () => {
    expect(parseAmountToMinor("-12.34")).toBe(-1234);
  });

  it("returns null for junk", () => {
    expect(parseAmountToMinor("")).toBeNull();
    expect(parseAmountToMinor("abc")).toBeNull();
  });

  it("round-trips through minorToDecimalString", () => {
    for (const value of ["0.01", "9.99", "1234.05", "1000000.00"]) {
      const minor = parseAmountToMinor(value);
      expect(minor).not.toBeNull();
      expect(minorToDecimalString(minor as number)).toBe(value);
    }
  });

  it("never loses cents to floating point", () => {
    // 0.1 + 0.2 territory: the classic failure this design avoids.
    const a = parseAmountToMinor("0.10") as number;
    const b = parseAmountToMinor("0.20") as number;
    expect(minorToDecimalString(a + b)).toBe("0.30");
  });
});

describe("formatMoney", () => {
  it("formats with the right number of decimals", () => {
    expect(formatMoney(123456, "USD", "en-US")).toBe("$1,234.56");
    expect(formatMoney(1250, "JPY", "en-US")).toBe("¥1,250");
  });

  it("falls back rather than throwing on a bad code", () => {
    expect(formatMoney(1234, "ZZZ", "en-US")).toContain("12.34");
  });
});
