import { describe, expect, it } from "vitest";
import { currencyExponent } from "./money.js";
import {
  COUNTRY_CURRENCY,
  countryName,
  currencyName,
  currencySymbol,
  detectCurrency,
  isKnownCurrency,
  listCurrencies,
  regionOfLocale,
  searchCurrencies,
} from "./currency.js";

describe("catalogue integrity", () => {
  it("gives every country a currency that has a name", () => {
    const missing = Object.entries(COUNTRY_CURRENCY).filter(
      ([, currency]) => !isKnownCurrency(currency),
    );
    expect(missing).toEqual([]);
  });

  it("uses well-formed ISO codes throughout", () => {
    for (const [country, currency] of Object.entries(COUNTRY_CURRENCY)) {
      expect(country, `country ${country}`).toMatch(/^[A-Z]{2}$/);
      expect(currency, `currency ${currency}`).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("agrees with the money module on non-standard minor units", () => {
    // A mismatch here would store amounts at the wrong scale.
    expect(currencyExponent(COUNTRY_CURRENCY.JP as string)).toBe(0);
    expect(currencyExponent(COUNTRY_CURRENCY.KW as string)).toBe(3);
    expect(currencyExponent(COUNTRY_CURRENCY.VN as string)).toBe(0);
    expect(currencyExponent(COUNTRY_CURRENCY.US as string)).toBe(2);
  });

  it("maps the currencies people actually ask about", () => {
    expect(COUNTRY_CURRENCY.SG).toBe("SGD");
    expect(COUNTRY_CURRENCY.MY).toBe("MYR");
    expect(COUNTRY_CURRENCY.GB).toBe("GBP");
    expect(COUNTRY_CURRENCY.DE).toBe("EUR");
    expect(COUNTRY_CURRENCY.IN).toBe("INR");
    expect(COUNTRY_CURRENCY.BR).toBe("BRL");
    expect(COUNTRY_CURRENCY.NG).toBe("NGN");
  });
});

describe("names and symbols", () => {
  it("names common currencies", () => {
    expect(currencyName("SGD", "en")).toMatch(/Singapore/i);
    expect(currencyName("JPY", "en")).toMatch(/Yen/i);
  });

  it("returns the code rather than throwing on an unknown one", () => {
    expect(currencyName("ZZZ", "en")).toBe("ZZZ");
    expect(currencySymbol("ZZZ", "en")).toBeTruthy();
  });

  it("resolves symbols for majors", () => {
    expect(currencySymbol("USD", "en")).toContain("$");
    expect(currencySymbol("EUR", "en")).toContain("€");
    expect(currencySymbol("GBP", "en")).toContain("£");
  });

  it("names countries", () => {
    expect(countryName("SG", "en")).toMatch(/Singapore/i);
  });
});

describe("listCurrencies", () => {
  it("lists each currency once, with the countries that use it", () => {
    const options = listCurrencies("en");
    const codes = options.map((o) => o.code);
    expect(new Set(codes).size).toBe(codes.length);

    const euro = options.find((o) => o.code === "EUR");
    expect(euro?.countries).toContain("DE");
    expect(euro?.countries).toContain("FR");
    expect(euro?.countries.length).toBeGreaterThan(15);
  });

  it("sorts by name", () => {
    const names = listCurrencies("en").map((o) => o.name);
    expect([...names].sort((a, b) => a.localeCompare(b, "en"))).toEqual(names);
  });
});

describe("searchCurrencies", () => {
  it("finds a currency by its country name", () => {
    // The whole point of the feature: people know their country, not the code.
    expect(searchCurrencies("singapore", "en")[0]?.code).toBe("SGD");
    expect(searchCurrencies("germany", "en")[0]?.code).toBe("EUR");
    expect(searchCurrencies("japan", "en")[0]?.code).toBe("JPY");
  });

  it("finds a currency by code, exact match first", () => {
    expect(searchCurrencies("sgd", "en")[0]?.code).toBe("SGD");
    expect(searchCurrencies("INR", "en")[0]?.code).toBe("INR");
  });

  it("finds a currency by its name", () => {
    expect(searchCurrencies("rupiah", "en")[0]?.code).toBe("IDR");
  });

  it("finds by ISO country code", () => {
    expect(searchCurrencies("MY", "en").some((o) => o.code === "MYR")).toBe(true);
  });

  it("returns everything (capped) for an empty query", () => {
    expect(searchCurrencies("", "en", 10)).toHaveLength(10);
  });

  it("returns nothing for nonsense rather than guessing", () => {
    expect(searchCurrencies("qqqzzz", "en")).toEqual([]);
  });
});

describe("regionOfLocale", () => {
  it("reads the region subtag", () => {
    expect(regionOfLocale("en-SG")).toBe("SG");
    expect(regionOfLocale("pt-BR")).toBe("BR");
    expect(regionOfLocale("zh-Hant-TW")).toBe("TW");
  });

  it("returns null when there is no region", () => {
    expect(regionOfLocale("en")).toBeNull();
    expect(regionOfLocale("nonsense")).toBeNull();
  });
});

describe("detectCurrency", () => {
  it("infers the currency from the device locale", () => {
    expect(detectCurrency("en-SG")).toBe("SGD");
    expect(detectCurrency("de-DE")).toBe("EUR");
    expect(detectCurrency("ja-JP")).toBe("JPY");
    expect(detectCurrency("en-GB")).toBe("GBP");
    expect(detectCurrency("ms-MY")).toBe("MYR");
  });

  it("walks the preference list until one yields a region", () => {
    expect(detectCurrency(["eo", "en", "fr-CA"])).toBe("CAD");
  });

  it("falls back to USD only when nothing is inferable", () => {
    expect(detectCurrency(["eo"])).toBe("USD");
    expect(detectCurrency("zz-ZZ")).toBe("USD");
  });
});
