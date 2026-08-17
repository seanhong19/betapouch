import { describe, expect, it } from "vitest";
import { hasRedactions, redactSensitive } from "./redact.js";

describe("redactSensitive", () => {
  it("masks a valid card number down to the last four", () => {
    const result = redactSensitive("VISA 4111 1111 1111 1111 approved");
    expect(result.text).toContain("[card ****1111]");
    expect(result.text).not.toContain("4111 1111");
    expect(result.removed.card).toBe(1);
  });

  it("does not claim a non-Luhn digit run is a card", () => {
    // An order number, not a card: it must not be reported as a masked PAN.
    const result = redactSensitive("Order 12345678901");
    expect(result.text).not.toContain("[card");
    expect(result.removed.card).toBeUndefined();
    expect(result.text).toContain("12345678901");
  });

  it("still masks long unidentified digit runs generically", () => {
    // 12+ digits could be a loyalty or account number; the model never needs it.
    const result = redactSensitive("Member 1234567890123");
    expect(result.text).toContain("[number]");
    expect(result.removed.longDigits).toBe(1);
  });

  it("removes emails, URLs and IBANs", () => {
    const result = redactSensitive(
      "contact billing@example.com or https://example.com/pay GB29NWBK60161331926819",
    );
    expect(result.text).toContain("[email]");
    expect(result.text).toContain("[url]");
    expect(result.text).toContain("[iban]");
  });

  it("removes phone numbers but keeps prices", () => {
    const result = redactSensitive("Tel: +1 555 123 4567\nTOTAL 29.19");
    expect(result.text).toContain("[phone]");
    expect(result.text).toContain("29.19");
  });

  it("reports when nothing was removed", () => {
    const result = redactSensitive("Coffee 4.50\nTOTAL 4.50");
    expect(hasRedactions(result)).toBe(false);
    expect(result.text).toBe("Coffee 4.50\nTOTAL 4.50");
  });
});
