/**
 * Money is stored as an integer number of minor units (cents, pence, sen…).
 * Floating point never touches a stored amount — only display formatting.
 */
/** Currencies whose minor unit is not 1/100. Everything else defaults to 2 digits. */
const EXPONENT_OVERRIDES = {
    BHD: 3,
    BIF: 0,
    CLP: 0,
    DJF: 0,
    GNF: 0,
    IQD: 3,
    ISK: 0,
    JOD: 3,
    JPY: 0,
    KMF: 0,
    KRW: 0,
    KWD: 3,
    LYD: 3,
    OMR: 3,
    PYG: 0,
    RWF: 0,
    TND: 3,
    UGX: 0,
    UYI: 0,
    VND: 0,
    VUV: 0,
    XAF: 0,
    XOF: 0,
    XPF: 0,
};
export function currencyExponent(currency) {
    return EXPONENT_OVERRIDES[currency.toUpperCase()] ?? 2;
}
/** Parse a human-typed amount ("1,234.56", "1.234,56", "$12") into minor units. */
export function parseAmountToMinor(input, currency = "USD") {
    const exponent = currencyExponent(currency);
    // Keep digits and separators only; drop currency symbols, spaces, NBSP.
    let cleaned = input.replace(/[^\d.,\-]/g, "").trim();
    if (!cleaned)
        return null;
    const negative = cleaned.startsWith("-");
    cleaned = cleaned.replace(/-/g, "");
    const lastComma = cleaned.lastIndexOf(",");
    const lastDot = cleaned.lastIndexOf(".");
    let decimalSep = null;
    if (lastComma !== -1 && lastDot !== -1) {
        decimalSep = lastComma > lastDot ? "," : ".";
    }
    else if (lastComma !== -1) {
        // A lone comma is a decimal separator only when it looks like one (1,50) —
        // "1,500" is a thousands group.
        decimalSep = cleaned.length - lastComma - 1 <= 2 && cleaned.length - lastComma - 1 > 0 ? "," : null;
    }
    else if (lastDot !== -1) {
        decimalSep = cleaned.length - lastDot - 1 <= 2 && cleaned.length - lastDot - 1 > 0 ? "." : null;
    }
    let whole;
    let fraction = "";
    if (decimalSep) {
        const idx = cleaned.lastIndexOf(decimalSep);
        whole = cleaned.slice(0, idx);
        fraction = cleaned.slice(idx + 1);
    }
    else {
        whole = cleaned;
    }
    whole = whole.replace(/[.,]/g, "");
    fraction = fraction.replace(/[.,]/g, "");
    if (!whole && !fraction)
        return null;
    const digits = (whole || "0") + fraction.padEnd(exponent, "0").slice(0, exponent);
    const value = Number.parseInt(digits || "0", 10);
    if (!Number.isFinite(value))
        return null;
    return negative ? -value : value;
}
/** Convert minor units back to a decimal string ("1234" @ USD -> "12.34"). */
export function minorToDecimalString(minor, currency = "USD") {
    const exponent = currencyExponent(currency);
    const negative = minor < 0;
    const digits = Math.abs(Math.trunc(minor)).toString().padStart(exponent + 1, "0");
    const whole = digits.slice(0, digits.length - exponent) || "0";
    const fraction = exponent > 0 ? `.${digits.slice(digits.length - exponent)}` : "";
    return `${negative ? "-" : ""}${whole}${fraction}`;
}
export function formatMoney(minor, currency = "USD", locale) {
    const exponent = currencyExponent(currency);
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            minimumFractionDigits: exponent,
            maximumFractionDigits: exponent,
        }).format(minor / 10 ** exponent);
    }
    catch {
        return `${currency} ${minorToDecimalString(minor, currency)}`;
    }
}
/** Compact form for dashboard tiles: 1,284 / 12.9K / 4.2M. */
export function formatMoneyCompact(minor, currency = "USD", locale) {
    const exponent = currencyExponent(currency);
    const value = minor / 10 ** exponent;
    const abs = Math.abs(value);
    try {
        return new Intl.NumberFormat(locale, {
            style: "currency",
            currency,
            notation: abs >= 10_000 ? "compact" : "standard",
            maximumFractionDigits: abs >= 10_000 ? 1 : exponent,
            minimumFractionDigits: abs >= 10_000 ? 0 : exponent,
        }).format(value);
    }
    catch {
        return formatMoney(minor, currency, locale);
    }
}
