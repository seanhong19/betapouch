import { describe, expect, it } from "vitest";
import { normaliseMerchantKey, recallCategory, resolveCategory, suggestCategory } from "./categorize.js";
import { extractDate, parseReceiptText } from "./parse.js";

const GROCERY_RECEIPT = `
WHOLE FOODS MARKET
123 Market Street
Tel: 555-0100

03/14/2025  19:42

Organic Bananas        3.49
Almond Milk 1L         4.29
Sourdough Loaf         6.50
Chicken Breast        12.75

SUBTOTAL              27.03
TAX                    2.16
TOTAL                 29.19

VISA ************1234
THANK YOU
`;

const RESTAURANT_RECEIPT = `
The Corner Bistro
14 Mar 2025 20:15

Pasta                 18.00
Wine                  12.00

Subtotal              30.00
Service Charge         3.00
VAT                    6.60
AMOUNT DUE            39.60
CASH
`;

describe("parseReceiptText", () => {
  it("pulls merchant, date, total and tax off a grocery receipt", () => {
    const parsed = parseReceiptText(GROCERY_RECEIPT);
    expect(parsed.merchant).toBe("Whole Foods Market");
    expect(parsed.totalMinor).toBe(2919);
    expect(parsed.subtotalMinor).toBe(2703);
    expect(parsed.taxMinor).toBe(216);
    expect(parsed.occurredAt?.slice(0, 10)).toBe("2025-03-14");
    expect(parsed.category).toBe("groceries");
    expect(parsed.paymentHint).toBe("card");
  });

  it("reports high confidence when subtotal + tax reconciles to the total", () => {
    const parsed = parseReceiptText(GROCERY_RECEIPT);
    expect(parsed.confidence).toBeGreaterThan(0.8);
  });

  it("keeps the time of day", () => {
    const parsed = parseReceiptText(GROCERY_RECEIPT);
    expect(parsed.occurredAt).toContain("T19:42");
  });

  it("finds line items without swallowing the totals block", () => {
    const parsed = parseReceiptText(GROCERY_RECEIPT);
    const descriptions = parsed.lineItems.map((i) => i.description.toLowerCase());
    expect(descriptions.some((d) => d.includes("banana"))).toBe(true);
    expect(descriptions.some((d) => d.includes("total"))).toBe(false);
    expect(descriptions.some((d) => d.includes("tax"))).toBe(false);
  });

  it("handles 'AMOUNT DUE' and named-month dates", () => {
    const parsed = parseReceiptText(RESTAURANT_RECEIPT);
    expect(parsed.totalMinor).toBe(3960);
    expect(parsed.occurredAt?.slice(0, 10)).toBe("2025-03-14");
    expect(parsed.tipMinor).toBe(300);
    expect(parsed.category).toBe("dining");
    expect(parsed.paymentHint).toBe("cash");
  });

  it("detects currency from a symbol", () => {
    const parsed = parseReceiptText("Cafe Nero\n01/02/2025\nTOTAL £8.40");
    expect(parsed.currency).toBe("GBP");
    expect(parsed.totalMinor).toBe(840);
  });

  it("prefers an explicit ISO 4217 code over a symbol", () => {
    const parsed = parseReceiptText("Shop\n2025-02-01\nTOTAL SGD 12.00");
    expect(parsed.currency).toBe("SGD");
  });

  it("ignores a 'TOTAL SAVINGS' line when finding the real total", () => {
    const parsed = parseReceiptText(
      "SuperMart\n2025-01-05\nTOTAL SAVINGS 5.00\nItem 10.00\nTOTAL 10.00",
    );
    expect(parsed.totalMinor).toBe(1000);
  });

  it("falls back to the largest amount when nothing is labelled", () => {
    const parsed = parseReceiptText("Corner Shop\n2025-01-05\n3.00\n11.50\n2.25");
    expect(parsed.totalMinor).toBe(1150);
    expect(parsed.confidence).toBeLessThan(0.7);
  });

  it("never returns NaN or undefined amounts for unreadable input", () => {
    const parsed = parseReceiptText("~~~ ### ???");
    expect(parsed.totalMinor).toBeNull();
    expect(parsed.confidence).toBeGreaterThanOrEqual(0);
  });
});

describe("extractDate", () => {
  it("reads ISO dates", () => {
    expect(extractDate("Date: 2025-03-14")?.toISOString().slice(0, 10)).toBe("2025-03-14");
  });

  it("disambiguates when a component exceeds 12", () => {
    expect(extractDate("25/03/2025")?.toISOString().slice(0, 10)).toBe("2025-03-25");
  });

  it("honours the dayFirst preference for ambiguous dates", () => {
    expect(extractDate("03/04/2025", false)?.toISOString().slice(0, 10)).toBe("2025-03-04");
    expect(extractDate("03/04/2025", true)?.toISOString().slice(0, 10)).toBe("2025-04-03");
  });

  it("rejects impossible and far-future dates", () => {
    expect(extractDate("45/45/2025")).toBeNull();
    expect(extractDate("2099-01-01")).toBeNull();
  });

  it("returns null when there is no date", () => {
    expect(extractDate("no dates here")).toBeNull();
  });
});

describe("categorisation", () => {
  it("suggests from keywords", () => {
    expect(suggestCategory("UBER TRIP")).toBe("transport");
    expect(suggestCategory("Netflix monthly")).toBe("entertainment");
    expect(suggestCategory("qqq zzz")).toBeNull();
  });

  it("normalises merchant keys across store numbers and suffixes", () => {
    expect(normaliseMerchantKey("Kopitiam Pte Ltd #12")).toBe(normaliseMerchantKey("KOPITIAM"));
  });

  it("prefers what the user chose before over the keyword guess", () => {
    const memory = { [normaliseMerchantKey("Shell")]: "business" as const };
    expect(recallCategory(memory, "Shell #402")).toBe("business");
    expect(resolveCategory(memory, "Shell #402", "fuel")).toBe("business");
    expect(resolveCategory({}, "Shell #402", "fuel")).toBe("transport");
  });
});
