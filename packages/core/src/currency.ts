/**
 * Currency catalogue.
 *
 * Two things are needed that the platform cannot supply: which currency a
 * country uses, and a name for a currency when `Intl` is unavailable. Both are
 * static tables here. Everything else — localised names, symbols, country
 * names — is derived from `Intl` at runtime, so the picker speaks the user's
 * language without shipping a translation table.
 *
 * `Intl.DisplayNames` is missing on some React Native/Hermes builds, so every
 * lookup degrades to the English table and then to the bare code. A picker
 * that throws is worse than one that says "SGD".
 */

/** ISO 3166-1 alpha-2 → the country's primary official ISO 4217 currency. */
export const COUNTRY_CURRENCY: Record<string, string> = {
  AD: "EUR", AE: "AED", AF: "AFN", AG: "XCD", AI: "XCD", AL: "ALL", AM: "AMD",
  AO: "AOA", AR: "ARS", AS: "USD", AT: "EUR", AU: "AUD", AW: "AWG", AX: "EUR",
  AZ: "AZN", BA: "BAM", BB: "BBD", BD: "BDT", BE: "EUR", BF: "XOF", BG: "BGN",
  BH: "BHD", BI: "BIF", BJ: "XOF", BM: "BMD", BN: "BND", BO: "BOB", BR: "BRL",
  BS: "BSD", BT: "BTN", BW: "BWP", BY: "BYN", BZ: "BZD", CA: "CAD", CD: "CDF",
  CF: "XAF", CG: "XAF", CH: "CHF", CI: "XOF", CK: "NZD", CL: "CLP", CM: "XAF",
  CN: "CNY", CO: "COP", CR: "CRC", CU: "CUP", CV: "CVE", CW: "ANG", CY: "EUR",
  CZ: "CZK", DE: "EUR", DJ: "DJF", DK: "DKK", DM: "XCD", DO: "DOP", DZ: "DZD",
  EC: "USD", EE: "EUR", EG: "EGP", ER: "ERN", ES: "EUR", ET: "ETB", FI: "EUR",
  FJ: "FJD", FK: "FKP", FM: "USD", FO: "DKK", FR: "EUR", GA: "XAF", GB: "GBP",
  GD: "XCD", GE: "GEL", GG: "GBP", GH: "GHS", GI: "GIP", GL: "DKK", GM: "GMD",
  GN: "GNF", GQ: "XAF", GR: "EUR", GT: "GTQ", GU: "USD", GW: "XOF", GY: "GYD",
  HK: "HKD", HN: "HNL", HR: "EUR", HT: "HTG", HU: "HUF", ID: "IDR", IE: "EUR",
  IL: "ILS", IM: "GBP", IN: "INR", IQ: "IQD", IR: "IRR", IS: "ISK", IT: "EUR",
  JE: "GBP", JM: "JMD", JO: "JOD", JP: "JPY", KE: "KES", KG: "KGS", KH: "KHR",
  KI: "AUD", KM: "KMF", KN: "XCD", KP: "KPW", KR: "KRW", KW: "KWD", KY: "KYD",
  KZ: "KZT", LA: "LAK", LB: "LBP", LC: "XCD", LI: "CHF", LK: "LKR", LR: "LRD",
  LS: "LSL", LT: "EUR", LU: "EUR", LV: "EUR", LY: "LYD", MA: "MAD", MC: "EUR",
  MD: "MDL", ME: "EUR", MG: "MGA", MH: "USD", MK: "MKD", ML: "XOF", MM: "MMK",
  MN: "MNT", MO: "MOP", MR: "MRU", MT: "EUR", MU: "MUR", MV: "MVR", MW: "MWK",
  MX: "MXN", MY: "MYR", MZ: "MZN", NA: "NAD", NC: "XPF", NE: "XOF", NG: "NGN",
  NI: "NIO", NL: "EUR", NO: "NOK", NP: "NPR", NR: "AUD", NZ: "NZD", OM: "OMR",
  PA: "PAB", PE: "PEN", PF: "XPF", PG: "PGK", PH: "PHP", PK: "PKR", PL: "PLN",
  PR: "USD", PS: "ILS", PT: "EUR", PW: "USD", PY: "PYG", QA: "QAR", RO: "RON",
  RS: "RSD", RU: "RUB", RW: "RWF", SA: "SAR", SB: "SBD", SC: "SCR", SD: "SDG",
  SE: "SEK", SG: "SGD", SI: "EUR", SK: "EUR", SL: "SLE", SM: "EUR", SN: "XOF",
  SO: "SOS", SR: "SRD", SS: "SSP", ST: "STN", SV: "USD", SY: "SYP", SZ: "SZL",
  TC: "USD", TD: "XAF", TG: "XOF", TH: "THB", TJ: "TJS", TL: "USD", TM: "TMT",
  TN: "TND", TO: "TOP", TR: "TRY", TT: "TTD", TV: "AUD", TW: "TWD", TZ: "TZS",
  UA: "UAH", UG: "UGX", US: "USD", UY: "UYU", UZ: "UZS", VA: "EUR", VC: "XCD",
  VE: "VES", VG: "USD", VI: "USD", VN: "VND", VU: "VUV", WS: "WST", XK: "EUR",
  YE: "YER", ZA: "ZAR", ZM: "ZMW", ZW: "ZWG",
};

/** English fallback names, used when `Intl.DisplayNames` is unavailable. */
const CURRENCY_NAMES: Record<string, string> = {
  AED: "UAE Dirham", AFN: "Afghan Afghani", ALL: "Albanian Lek", AMD: "Armenian Dram",
  ANG: "Caribbean Guilder", AOA: "Angolan Kwanza", ARS: "Argentine Peso",
  AUD: "Australian Dollar", AWG: "Aruban Florin", AZN: "Azerbaijani Manat",
  BAM: "Bosnia-Herzegovina Convertible Mark", BBD: "Barbadian Dollar",
  BDT: "Bangladeshi Taka", BGN: "Bulgarian Lev", BHD: "Bahraini Dinar",
  BIF: "Burundian Franc", BMD: "Bermudan Dollar", BND: "Brunei Dollar",
  BOB: "Bolivian Boliviano", BRL: "Brazilian Real", BSD: "Bahamian Dollar",
  BTN: "Bhutanese Ngultrum", BWP: "Botswanan Pula", BYN: "Belarusian Ruble",
  BZD: "Belize Dollar", CAD: "Canadian Dollar", CDF: "Congolese Franc",
  CHF: "Swiss Franc", CLP: "Chilean Peso", CNY: "Chinese Yuan",
  COP: "Colombian Peso", CRC: "Costa Rican Colón", CUP: "Cuban Peso",
  CVE: "Cape Verdean Escudo", CZK: "Czech Koruna", DJF: "Djiboutian Franc",
  DKK: "Danish Krone", DOP: "Dominican Peso", DZD: "Algerian Dinar",
  EGP: "Egyptian Pound", ERN: "Eritrean Nakfa", ETB: "Ethiopian Birr",
  EUR: "Euro", FJD: "Fijian Dollar", FKP: "Falkland Islands Pound",
  GBP: "British Pound", GEL: "Georgian Lari", GHS: "Ghanaian Cedi",
  GIP: "Gibraltar Pound", GMD: "Gambian Dalasi", GNF: "Guinean Franc",
  GTQ: "Guatemalan Quetzal", GYD: "Guyanaese Dollar", HKD: "Hong Kong Dollar",
  HNL: "Honduran Lempira", HTG: "Haitian Gourde", HUF: "Hungarian Forint",
  IDR: "Indonesian Rupiah", ILS: "Israeli New Shekel", INR: "Indian Rupee",
  IQD: "Iraqi Dinar", IRR: "Iranian Rial", ISK: "Icelandic Króna",
  JMD: "Jamaican Dollar", JOD: "Jordanian Dinar", JPY: "Japanese Yen",
  KES: "Kenyan Shilling", KGS: "Kyrgystani Som", KHR: "Cambodian Riel",
  KMF: "Comorian Franc", KPW: "North Korean Won", KRW: "South Korean Won",
  KWD: "Kuwaiti Dinar", KYD: "Cayman Islands Dollar", KZT: "Kazakhstani Tenge",
  LAK: "Laotian Kip", LBP: "Lebanese Pound", LKR: "Sri Lankan Rupee",
  LRD: "Liberian Dollar", LSL: "Lesotho Loti", LYD: "Libyan Dinar",
  MAD: "Moroccan Dirham", MDL: "Moldovan Leu", MGA: "Malagasy Ariary",
  MKD: "Macedonian Denar", MMK: "Myanmar Kyat", MNT: "Mongolian Tugrik",
  MOP: "Macanese Pataca", MRU: "Mauritanian Ouguiya", MUR: "Mauritian Rupee",
  MVR: "Maldivian Rufiyaa", MWK: "Malawian Kwacha", MXN: "Mexican Peso",
  MYR: "Malaysian Ringgit", MZN: "Mozambican Metical", NAD: "Namibian Dollar",
  NGN: "Nigerian Naira", NIO: "Nicaraguan Córdoba", NOK: "Norwegian Krone",
  NPR: "Nepalese Rupee", NZD: "New Zealand Dollar", OMR: "Omani Rial",
  PAB: "Panamanian Balboa", PEN: "Peruvian Sol", PGK: "Papua New Guinean Kina",
  PHP: "Philippine Peso", PKR: "Pakistani Rupee", PLN: "Polish Zloty",
  PYG: "Paraguayan Guarani", QAR: "Qatari Rial", RON: "Romanian Leu",
  RSD: "Serbian Dinar", RUB: "Russian Ruble", RWF: "Rwandan Franc",
  SAR: "Saudi Riyal", SBD: "Solomon Islands Dollar", SCR: "Seychellois Rupee",
  SDG: "Sudanese Pound", SEK: "Swedish Krona", SGD: "Singapore Dollar",
  SLE: "Sierra Leonean Leone", SOS: "Somali Shilling", SRD: "Surinamese Dollar",
  SSP: "South Sudanese Pound", STN: "São Tomé & Príncipe Dobra",
  SYP: "Syrian Pound", SZL: "Swazi Lilangeni", THB: "Thai Baht",
  TJS: "Tajikistani Somoni", TMT: "Turkmenistani Manat", TND: "Tunisian Dinar",
  TOP: "Tongan Paʻanga", TRY: "Turkish Lira", TTD: "Trinidad & Tobago Dollar",
  TWD: "New Taiwan Dollar", TZS: "Tanzanian Shilling", UAH: "Ukrainian Hryvnia",
  UGX: "Ugandan Shilling", USD: "US Dollar", UYU: "Uruguayan Peso",
  UZS: "Uzbekistani Som", VES: "Venezuelan Bolívar", VND: "Vietnamese Dong",
  VUV: "Vanuatu Vatu", WST: "Samoan Tala", XAF: "Central African CFA Franc",
  XCD: "East Caribbean Dollar", XOF: "West African CFA Franc", XPF: "CFP Franc",
  YER: "Yemeni Rial", ZAR: "South African Rand", ZMW: "Zambian Kwacha",
  ZWG: "Zimbabwe Gold",
};

function safely<T>(run: () => T, fallback: T): T {
  try {
    const value = run();
    return value === undefined || value === null ? fallback : value;
  } catch {
    return fallback;
  }
}

export function currencyName(code: string, locale?: string): string {
  const upper = code.toUpperCase();
  const localised = safely(
    () => new Intl.DisplayNames([locale ?? "en"], { type: "currency" }).of(upper),
    undefined as string | undefined,
  );
  // Intl returns the code back when it has no name for it.
  if (localised && localised !== upper) return localised;
  return CURRENCY_NAMES[upper] ?? upper;
}

export function countryName(countryCode: string, locale?: string): string {
  const upper = countryCode.toUpperCase();
  return safely(
    () => new Intl.DisplayNames([locale ?? "en"], { type: "region" }).of(upper) ?? upper,
    upper,
  );
}

export function currencySymbol(code: string, locale?: string): string {
  const upper = code.toUpperCase();
  const extract = (currencyDisplay: "narrowSymbol" | "symbol") =>
    safely(() => {
      const parts = new Intl.NumberFormat(locale ?? "en", {
        style: "currency",
        currency: upper,
        currencyDisplay,
      }).formatToParts(0);
      return parts.find((part) => part.type === "currency")?.value;
    }, undefined as string | undefined);

  // narrowSymbol gives "$" rather than "SG$"; older engines reject the option
  // entirely, so fall back through plain symbol to the code itself.
  return extract("narrowSymbol") ?? extract("symbol") ?? upper;
}

export interface CurrencyOption {
  code: string;
  name: string;
  symbol: string;
  /** ISO 3166 codes that use it, so the list can be searched by country. */
  countries: string[];
  /** Lower-cased haystack: code, name, symbol and every country name. */
  searchText: string;
}

let cachedOptions: { locale: string; options: CurrencyOption[] } | null = null;

/**
 * Every currency in the catalogue, alphabetical by localised name, each
 * carrying the countries that use it so "Germany" finds the Euro.
 */
export function listCurrencies(locale = "en"): CurrencyOption[] {
  if (cachedOptions?.locale === locale) return cachedOptions.options;

  const byCurrency = new Map<string, string[]>();
  for (const [country, currency] of Object.entries(COUNTRY_CURRENCY)) {
    byCurrency.set(currency, [...(byCurrency.get(currency) ?? []), country]);
  }

  const options = [...byCurrency.entries()]
    .map(([code, countries]) => {
      const name = currencyName(code, locale);
      const symbol = currencySymbol(code, locale);
      const countryNames = countries.map((c) => countryName(c, locale));
      return {
        code,
        name,
        symbol,
        countries,
        searchText: [code, name, symbol, ...countries, ...countryNames]
          .join(" ")
          .toLowerCase(),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, locale));

  cachedOptions = { locale, options };
  return options;
}

/**
 * Search by code, currency name, symbol or country. An exact code match is
 * pinned to the top — someone who types "SGD" wants SGD first, not
 * "Singapore Dollar" ranked alphabetically among other matches.
 */
export function searchCurrencies(query: string, locale = "en", limit = 60): CurrencyOption[] {
  const all = listCurrencies(locale);
  const needle = query.trim().toLowerCase();
  if (!needle) return all.slice(0, limit);

  const matches = all.filter((option) => option.searchText.includes(needle));
  const exact = matches.filter((option) => option.code.toLowerCase() === needle);
  const startsWith = matches.filter(
    (option) =>
      option.code.toLowerCase() !== needle &&
      (option.code.toLowerCase().startsWith(needle) || option.name.toLowerCase().startsWith(needle)),
  );
  const rest = matches.filter((o) => !exact.includes(o) && !startsWith.includes(o));
  return [...exact, ...startsWith, ...rest].slice(0, limit);
}

export function isKnownCurrency(code: string): boolean {
  const upper = code.toUpperCase();
  return upper in CURRENCY_NAMES;
}

/** The region subtag of a BCP 47 locale, e.g. "en-SG" -> "SG". */
export function regionOfLocale(locale: string): string | null {
  const direct = safely(() => new Intl.Locale(locale).region ?? null, null);
  if (direct) return direct.toUpperCase();
  // Hermes may lack Intl.Locale; fall back to parsing the tag.
  const match = /^[a-z]{2,3}(?:-[A-Za-z]{4})?-([A-Za-z]{2}|\d{3})\b/.exec(locale);
  return match?.[1] ? match[1].toUpperCase() : null;
}

/**
 * The currency to start a new user on, inferred from their device locale.
 * Defaulting everyone to USD is a small insult to most of the world; this
 * makes the common case correct and the picker a confirmation rather than a
 * chore. Falls back to USD only when the locale says nothing useful.
 */
export function detectCurrency(locales?: readonly string[] | string): string {
  const candidates =
    typeof locales === "string"
      ? [locales]
      : locales && locales.length > 0
        ? [...locales]
        : safely(() => [...(globalThis.navigator?.languages ?? [])], [] as string[]);

  const withDefault = candidates.length
    ? candidates
    : [safely(() => Intl.DateTimeFormat().resolvedOptions().locale, "en-US")];

  for (const locale of withDefault) {
    const region = locale ? regionOfLocale(locale) : null;
    const currency = region ? COUNTRY_CURRENCY[region] : undefined;
    if (currency) return currency;
  }
  return "USD";
}

/** The device's locale tag, for seeding the formatting preference. */
export function detectLocale(): string {
  return safely(
    () =>
      globalThis.navigator?.languages?.[0] ??
      Intl.DateTimeFormat().resolvedOptions().locale ??
      "en-US",
    "en-US",
  );
}
