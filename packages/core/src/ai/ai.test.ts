import { describe, expect, it } from "vitest";
import { extractedToDraft } from "./index.js";
import { assertSafeEndpoint, isLoopback, joinUrl, UnsafeEndpointError } from "./endpoint.js";
import { extractJsonObject, parseExtraction } from "./types.js";

describe("endpoint policy", () => {
  it("accepts https", () => {
    expect(assertSafeEndpoint("https://api.anthropic.com").host).toBe("api.anthropic.com");
  });

  it("accepts plaintext http only for loopback", () => {
    expect(assertSafeEndpoint("http://localhost:11434").port).toBe("11434");
    expect(assertSafeEndpoint("http://127.0.0.1:4747").hostname).toBe("127.0.0.1");
    expect(() => assertSafeEndpoint("http://example.com")).toThrow(UnsafeEndpointError);
  });

  it("rejects non-http schemes and embedded credentials", () => {
    expect(() => assertSafeEndpoint("ftp://example.com")).toThrow(UnsafeEndpointError);
    expect(() => assertSafeEndpoint("https://user:pass@example.com")).toThrow(UnsafeEndpointError);
    expect(() => assertSafeEndpoint("not a url")).toThrow(UnsafeEndpointError);
  });

  it("recognises loopback forms", () => {
    expect(isLoopback(new URL("http://127.0.0.5"))).toBe(true);
    expect(isLoopback(new URL("https://api.openai.com"))).toBe(false);
  });

  it("joins paths without letting them escape the base origin", () => {
    expect(joinUrl("https://api.openai.com/v1", "chat/completions")).toBe(
      "https://api.openai.com/v1/chat/completions",
    );
    expect(joinUrl("https://proxy.example.com/llm/", "/v1/messages")).toBe(
      "https://proxy.example.com/llm/v1/messages",
    );
  });
});

describe("extractJsonObject", () => {
  it("reads a bare object", () => {
    expect(extractJsonObject('{"total":"1.00"}')).toEqual({ total: "1.00" });
  });

  it("reads an object out of a fenced block with prose around it", () => {
    const raw = 'Sure!\n```json\n{"total":"2.50"}\n```\nHope that helps.';
    expect(extractJsonObject(raw)).toEqual({ total: "2.50" });
  });

  it("handles braces inside strings", () => {
    expect(extractJsonObject('{"merchant":"A } B","total":"1.00"}')).toEqual({
      merchant: "A } B",
      total: "1.00",
    });
  });

  it("throws rather than guessing when there is no JSON", () => {
    expect(() => extractJsonObject("I could not read that receipt.")).toThrow();
  });
});

describe("parseExtraction", () => {
  it("rejects a category the model invented", () => {
    expect(() => parseExtraction('{"category":"crypto_gambling"}')).toThrow();
  });

  it("fills defaults for omitted fields", () => {
    const result = parseExtraction('{"total":"10.00"}');
    expect(result.merchant).toBeNull();
    expect(result.lineItems).toEqual([]);
  });
});

describe("extractedToDraft", () => {
  it("converts decimal strings to minor units in the right currency", () => {
    const draft = extractedToDraft(
      parseExtraction(
        '{"merchant":"Kopi","total":"12.30","tax":"1.10","currency":"SGD","category":"dining","confidence":0.9}',
      ),
    );
    expect(draft.amountMinor).toBe(1230);
    expect(draft.taxMinor).toBe(110);
    expect(draft.currency).toBe("SGD");
    expect(draft.category).toBe("dining");
    expect(draft.source).toBe("ai");
    expect(draft.reviewed).toBe(false);
  });

  it("drops a hallucinated far-future date instead of storing it", () => {
    const draft = extractedToDraft(parseExtraction('{"total":"5.00","occurredAt":"2999-01-01"}'));
    expect(draft.occurredAt).toBeUndefined();
  });

  it("ignores line items with no parseable amount", () => {
    const draft = extractedToDraft(
      parseExtraction('{"total":"5.00","lineItems":[{"description":"Tea","total":null}]}'),
    );
    expect(draft.lineItems).toEqual([]);
  });

  it("falls back to the given currency when the model omits one", () => {
    const draft = extractedToDraft(parseExtraction('{"total":"5.00"}'), "EUR");
    expect(draft.currency).toBe("EUR");
    expect(draft.amountMinor).toBe(500);
  });
});
