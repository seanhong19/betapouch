/**
 * Redaction applied to any text about to leave the device for a third-party
 * model. Receipts routinely carry a card PAN, a loyalty number, a cashier's
 * name or a delivery address — none of which the extractor needs.
 *
 * This is defence in depth, not a guarantee: the honest guarantee is "don't
 * send it at all", which is why AI enrichment is opt-in per provider.
 */

export interface RedactionResult {
  text: string;
  /** Counts by rule, so the UI can tell the user what was removed. */
  removed: Record<string, number>;
}

function luhnValid(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

interface Rule {
  name: string;
  pattern: RegExp;
  replacement: string | ((match: string) => string);
}

const RULES: Rule[] = [
  {
    name: "email",
    pattern: /\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b/g,
    replacement: "[email]",
  },
  {
    name: "iban",
    pattern: /\b[A-Z]{2}\d{2}[A-Z0-9]{10,30}\b/g,
    replacement: "[iban]",
  },
  {
    name: "card",
    // 13–19 digits with optional space/dash grouping; kept only if Luhn passes,
    // so order numbers and totals aren't mangled.
    pattern: /\b(?:\d[ -]?){13,19}\b/g,
    replacement: (match: string) => {
      const digits = match.replace(/\D/g, "");
      if (digits.length < 13 || digits.length > 19 || !luhnValid(digits)) return match;
      return `[card ****${digits.slice(-4)}]`;
    },
  },
  {
    name: "phone",
    pattern: /(?:\+\d{1,3}[ .-]?)?(?:\(\d{2,4}\)[ .-]?)?\d{3,4}[ .-]\d{3,4}(?:[ .-]\d{3,4})?/g,
    replacement: (match: string) => (match.replace(/\D/g, "").length >= 9 ? "[phone]" : match),
  },
  {
    name: "longDigits",
    // Loyalty/membership/account numbers: 12+ bare digits that survived above.
    pattern: /\b\d{12,}\b/g,
    replacement: "[number]",
  },
  {
    name: "url",
    pattern: /\bhttps?:\/\/\S+/gi,
    replacement: "[url]",
  },
];

export function redactSensitive(input: string): RedactionResult {
  const removed: Record<string, number> = {};
  let text = input;
  for (const rule of RULES) {
    text = text.replace(rule.pattern, (match) => {
      const out =
        typeof rule.replacement === "function" ? rule.replacement(match) : rule.replacement;
      if (out !== match) removed[rule.name] = (removed[rule.name] ?? 0) + 1;
      return out;
    });
  }
  return { text, removed };
}

/** True when redaction changed anything — used to warn before sending. */
export function hasRedactions(result: RedactionResult): boolean {
  return Object.keys(result.removed).length > 0;
}
