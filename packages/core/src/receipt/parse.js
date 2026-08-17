import { currencyExponent, parseAmountToMinor } from "../money.js";
import { suggestCategory } from "./categorize.js";
const SYMBOL_TO_CURRENCY = {
    $: "USD",
    "£": "GBP",
    "€": "EUR",
    "¥": "JPY",
    "₹": "INR",
    "₩": "KRW",
    "₽": "RUB",
    "₺": "TRY",
    "₫": "VND",
    "₱": "PHP",
    "R$": "BRL",
};
const CODE_PATTERN = /\b(USD|EUR|GBP|JPY|CNY|HKD|SGD|AUD|NZD|CAD|CHF|SEK|NOK|DKK|PLN|CZK|INR|IDR|MYR|THB|VND|PHP|KRW|TWD|ZAR|BRL|MXN|AED|SAR|TRY|ILS)\b/;
const NOISE_LINE = /^(?:[-=*_.\s]{3,}|thank you|thanks|welcome|customer copy|merchant copy|receipt|invoice|tel|phone|fax|www\.|https?:)/i;
const TOTAL_LABELS = [
    /\b(?:grand\s+total|amount\s+due|balance\s+due|total\s+due|total\s+amount|total)\b/i,
];
const SUBTOTAL_LABELS = [/\b(?:sub[\s-]?total|net\s+amount)\b/i];
const TAX_LABELS = [/\b(?:tax|vat|gst|hst|pst|sales\s+tax|service\s+tax|ppn)\b/i];
const TIP_LABELS = [/\b(?:tip|gratuity|service\s+charge)\b/i];
const CASH_LABELS = /\b(?:cash|change\s+due|tendered)\b/i;
const CARD_LABELS = /\b(?:visa|mastercard|amex|american\s+express|debit|credit|card|contactless|chip)\b/i;
/** Any number that looks like a monetary amount, with its position in the line. */
const AMOUNT_PATTERN = /(-?\(?\s*(?:[$£€¥₹₩₽₺₫₱]|R\$)?\s*\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?\s*\)?)/g;
function extractAmounts(line, currency) {
    const out = [];
    for (const match of line.matchAll(AMOUNT_PATTERN)) {
        const raw = (match[1] ?? "").trim();
        if (!raw)
            continue;
        const digits = raw.replace(/\D/g, "");
        if (!digits)
            continue;
        // A bare 1–3 digit run with no separator is usually a quantity or an item
        // code, not a price. Require a decimal part or a currency marker.
        const looksMonetary = /[.,]\d{1,2}\s*\)?$/.test(raw) || /[$£€¥₹₩₽₺₫₱]/.test(raw) || digits.length >= 4;
        if (!looksMonetary)
            continue;
        const negative = /^\(.*\)$/.test(raw.replace(/\s/g, "")) || raw.trimStart().startsWith("-");
        const minor = parseAmountToMinor(raw, currency);
        if (minor === null)
            continue;
        out.push({ minor: negative ? -Math.abs(minor) : minor, raw });
    }
    return out;
}
function detectCurrency(text) {
    const code = text.match(CODE_PATTERN);
    if (code?.[1])
        return code[1];
    for (const [symbol, currency] of Object.entries(SYMBOL_TO_CURRENCY)) {
        if (text.includes(symbol))
            return currency;
    }
    return null;
}
const MONTHS = {
    jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
    jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};
function clampDate(year, month, day) {
    if (month < 1 || month > 12 || day < 1 || day > 31)
        return null;
    const d = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
    if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) {
        return null;
    }
    // A receipt from the future, or from before card terminals existed, is a
    // misread rather than a date.
    const now = Date.now();
    if (d.getTime() > now + 36 * 3600 * 1000)
        return null;
    if (d.getUTCFullYear() < 1990)
        return null;
    return d;
}
/**
 * Date extraction. `dayFirst` disambiguates 03/04/2025 — pass the user's
 * locale preference; we default to false (US-style) but prefer an unambiguous
 * reading whenever one component is > 12.
 */
export function extractDate(text, dayFirst = false) {
    // ISO first: unambiguous.
    const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
    if (iso) {
        const d = clampDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
        if (d)
            return withTime(d, text);
    }
    // 12 Mar 2025 / Mar 12, 2025
    const named = text.match(/\b(?:(\d{1,2})\s+([A-Za-z]{3,9})|([A-Za-z]{3,9})\s+(\d{1,2}))[,\s]+(\d{2,4})\b/);
    if (named) {
        const monthName = (named[2] ?? named[3] ?? "").slice(0, 4).toLowerCase();
        const month = MONTHS[monthName] ?? MONTHS[monthName.slice(0, 3)];
        const day = Number(named[1] ?? named[4]);
        let year = Number(named[5]);
        if (year < 100)
            year += year < 70 ? 2000 : 1900;
        if (month) {
            const d = clampDate(year, month, day);
            if (d)
                return withTime(d, text);
        }
    }
    // Numeric d/m/y or m/d/y
    const numeric = text.match(/\b(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})\b/);
    if (numeric) {
        const a = Number(numeric[1]);
        const b = Number(numeric[2]);
        let year = Number(numeric[3]);
        if (year < 100)
            year += year < 70 ? 2000 : 1900;
        let day;
        let month;
        if (a > 12) {
            day = a;
            month = b;
        }
        else if (b > 12) {
            month = a;
            day = b;
        }
        else if (dayFirst) {
            day = a;
            month = b;
        }
        else {
            month = a;
            day = b;
        }
        const d = clampDate(year, month, day);
        if (d)
            return withTime(d, text);
    }
    return null;
}
function withTime(date, text) {
    const time = text.match(/\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b/i);
    if (!time)
        return date;
    let hour = Number(time[1]);
    const minute = Number(time[2]);
    const second = time[3] ? Number(time[3]) : 0;
    const meridiem = time[4]?.toLowerCase();
    if (meridiem === "pm" && hour < 12)
        hour += 12;
    if (meridiem === "am" && hour === 12)
        hour = 0;
    if (hour > 23 || minute > 59 || second > 59)
        return date;
    const out = new Date(date);
    out.setUTCHours(hour, minute, second, 0);
    return out;
}
function findLabelledAmount(lines, labels, currency) {
    // Scan bottom-up: receipts put the authoritative total near the end, and a
    // "TOTAL SAVINGS" line earlier in the receipt should not win.
    for (let i = lines.length - 1; i >= 0; i--) {
        const line = lines[i];
        if (/\b(?:saving|discount|coupon|points|loyalty|previous|balance\s+forward)\b/i.test(line)) {
            continue;
        }
        if (!labels.some((l) => l.test(line)))
            continue;
        const amounts = extractAmounts(line, currency);
        const last = amounts.at(-1);
        if (last)
            return last.minor;
        // Label on its own line — the amount is often on the next one.
        const next = lines[i + 1];
        if (next && !/[a-z]{4,}/i.test(next)) {
            const nextAmounts = extractAmounts(next, currency);
            const value = nextAmounts.at(-1);
            if (value)
                return value.minor;
        }
    }
    return null;
}
function guessMerchant(lines) {
    for (const line of lines.slice(0, 6)) {
        const trimmed = line.trim();
        if (trimmed.length < 2 || trimmed.length > 60)
            continue;
        if (NOISE_LINE.test(trimmed))
            continue;
        if (/\d{3,}/.test(trimmed))
            continue; // address/phone/receipt number
        if (!/[A-Za-z]/.test(trimmed))
            continue;
        // Title-case what OCR gave us in all caps; leave mixed case alone.
        const normalised = trimmed === trimmed.toUpperCase()
            ? trimmed
                .toLowerCase()
                .replace(/\b[a-z]/g, (c) => c.toUpperCase())
            : trimmed;
        return normalised.replace(/\s{2,}/g, " ");
    }
    return null;
}
function extractLineItems(lines, currency, totalMinor) {
    const items = [];
    const stopLabels = [...TOTAL_LABELS, ...SUBTOTAL_LABELS, ...TAX_LABELS, ...TIP_LABELS];
    for (const line of lines) {
        if (stopLabels.some((l) => l.test(line)))
            continue;
        if (NOISE_LINE.test(line))
            continue;
        const amounts = extractAmounts(line, currency);
        const amount = amounts.at(-1);
        if (!amount || amount.minor <= 0)
            continue;
        if (totalMinor !== null && amount.minor > totalMinor)
            continue;
        const description = line
            .slice(0, line.lastIndexOf(amount.raw.trim().slice(-1)) + 1)
            .replace(AMOUNT_PATTERN, " ")
            .replace(/\s{2,}/g, " ")
            .replace(/[.\-_*]{2,}/g, " ")
            .trim();
        if (description.length < 2 || !/[A-Za-z]{2}/.test(description))
            continue;
        items.push({ description: description.slice(0, 120), totalAmountMinor: amount.minor });
        if (items.length >= 100)
            break;
    }
    return items;
}
export function parseReceiptText(rawText, options = {}) {
    const text = rawText.replace(/\r\n?/g, "\n");
    const lines = text
        .split("\n")
        .map((l) => l.replace(/\s+/g, " ").trim())
        .filter((l) => l.length > 0);
    const currency = detectCurrency(text) ?? options.defaultCurrency ?? "USD";
    const merchant = guessMerchant(lines);
    const date = extractDate(text, options.dayFirst ?? false);
    let totalMinor = findLabelledAmount(lines, TOTAL_LABELS, currency);
    const subtotalMinor = findLabelledAmount(lines, SUBTOTAL_LABELS, currency);
    const taxMinor = findLabelledAmount(lines, TAX_LABELS, currency);
    const tipMinor = findLabelledAmount(lines, TIP_LABELS, currency);
    // No labelled total: fall back to the largest plausible amount on the page.
    let totalWasGuessed = false;
    if (totalMinor === null) {
        const all = lines.flatMap((line) => extractAmounts(line, currency)).map((a) => a.minor);
        const max = all.length ? Math.max(...all) : null;
        if (max !== null && max > 0) {
            totalMinor = max;
            totalWasGuessed = true;
        }
    }
    const lineItems = extractLineItems(lines, currency, totalMinor);
    let paymentHint = null;
    if (CARD_LABELS.test(text))
        paymentHint = "card";
    else if (CASH_LABELS.test(text))
        paymentHint = "cash";
    // Confidence is the share of the signals we wanted and actually got, with a
    // bonus when subtotal + tax + tip reconciles against the total.
    let score = 0;
    let weight = 0;
    const add = (found, w) => {
        weight += w;
        if (found)
            score += w;
    };
    add(totalMinor !== null && !totalWasGuessed, 4);
    add(totalWasGuessed, 1);
    add(date !== null, 3);
    add(merchant !== null, 2);
    add(taxMinor !== null, 1);
    add(lineItems.length > 0, 1);
    if (totalMinor !== null && subtotalMinor !== null) {
        const reconstructed = subtotalMinor + (taxMinor ?? 0) + (tipMinor ?? 0);
        const tolerance = Math.max(2, Math.round(totalMinor * 0.01));
        if (Math.abs(reconstructed - totalMinor) <= tolerance) {
            score += 2;
        }
        weight += 2;
    }
    const confidence = weight > 0 ? Math.min(1, score / weight) : 0;
    return {
        merchant,
        occurredAt: date ? date.toISOString() : null,
        currency,
        totalMinor,
        subtotalMinor,
        taxMinor,
        tipMinor,
        paymentHint,
        lineItems,
        category: suggestCategory(`${merchant ?? ""}\n${text}`),
        confidence: Number(confidence.toFixed(2)),
    };
}
export { currencyExponent };
