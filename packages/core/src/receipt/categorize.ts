import type { Category } from "../models.js";

/**
 * Keyword-based category suggestion. Runs offline, costs nothing, and is
 * right often enough to save typing. The user's correction always wins — see
 * `learnCategory` for the local, on-device memory of past corrections.
 */

const KEYWORDS: [Category, RegExp][] = [
  [
    "groceries",
    /\b(grocer|supermarket|market|mart|aldi|lidl|tesco|sainsbury|kroger|safeway|whole\s*foods|trader\s*joe|costco|walmart|carrefour|coles|woolworths|ntuc|fairprice|produce|butcher|bakery)\b/i,
  ],
  [
    "dining",
    /\b(restaurant|cafe|caf[eé]|coffee|starbucks|kopi|bistro|diner|pizzeria|pizza|burger|sushi|ramen|noodle|bar\b|pub|brewery|grill|kitchen|eatery|deli|food\s*court|mcdonald|kfc|subway|chipotle|doordash|ubereats|grubhub|deliveroo|grab\s*food)\b/i,
  ],
  [
    "transport",
    /\b(uber|lyft|grab|bolt|taxi|cab|metro|subway\s+card|transit|mrt|bus\b|train|rail|parking|toll|petrol|gasoline|gas\s+station|shell|chevron|exxon|bp\b|fuel|ev\s*charg|garage|mot\b)\b/i,
  ],
  [
    "housing",
    /\b(rent|landlord|mortgage|lease|property\s+management|hoa\b|maintenance\s+fee|furniture|ikea|home\s*depot|lowes|hardware)\b/i,
  ],
  [
    "utilities",
    /\b(electric|electricity|water\s+bill|gas\s+bill|utility|utilities|internet|broadband|fibre|fiber|mobile\s+plan|phone\s+bill|telecom|verizon|at&t|vodafone|comcast|xfinity|singtel|waste|sewer)\b/i,
  ],
  [
    "health",
    /\b(pharmacy|chemist|drug\s*store|walgreens|cvs\b|boots\b|guardian|watsons|clinic|hospital|doctor|dentist|dental|optic|medical|health|physio|therapy|insurance\s+premium)\b/i,
  ],
  [
    "shopping",
    /\b(amazon|ebay|shopee|lazada|target|best\s*buy|apple\s+store|zara|uniqlo|h&m|nike|adidas|department\s+store|mall|boutique|shop\b)\b/i,
  ],
  [
    "entertainment",
    /\b(netflix|spotify|disney|hulu|hbo|prime\s+video|cinema|movie|theat(?:re|er)|concert|ticket|game|steam|playstation|xbox|nintendo|museum|gym|fitness|club)\b/i,
  ],
  [
    "travel",
    /\b(airline|airways|flight|air\s*asia|emirates|delta|united\b|ryanair|hotel|hostel|motel|airbnb|booking\.com|agoda|expedia|resort|luggage|visa\s+fee|passport)\b/i,
  ],
  [
    "education",
    /\b(tuition|school|university|college|course|udemy|coursera|textbook|bookstore|library|exam\s+fee|training)\b/i,
  ],
  [
    "business",
    /\b(office|stationery|staples|coworking|wework|aws\b|google\s+cloud|azure|github|domain|hosting|saas|subscription\s+invoice|consult)\b/i,
  ],
  [
    "fees",
    /\b(bank\s+fee|service\s+fee|atm\s+fee|interest|late\s+fee|penalty|surcharge|commission|tax\s+payment|stamp\s+duty)\b/i,
  ],
];

export function suggestCategory(text: string): Category | null {
  if (!text.trim()) return null;
  let best: { category: Category; hits: number } | null = null;
  for (const [category, pattern] of KEYWORDS) {
    const matches = text.match(new RegExp(pattern.source, "gi"));
    const hits = matches?.length ?? 0;
    if (hits > 0 && (!best || hits > best.hits)) best = { category, hits };
  }
  return best?.category ?? null;
}

/**
 * A tiny on-device memory: merchant name (normalised) -> category the user
 * chose. Beats keywords when present, because it is that user's own history.
 */
export type CategoryMemory = Record<string, Category>;

/**
 * Collapse the many printed forms of one merchant onto a single key, so a
 * category learned at "SHELL #402" also applies at "Shell Station No. 118".
 * Branch numbers and legal suffixes are the two things that vary most.
 */
export function normaliseMerchantKey(merchant: string): string {
  return merchant
    .toLowerCase()
    .replace(/#\s*\d+/g, " ")
    .replace(/\bno\.?\s*\d+\b/g, " ")
    .replace(/\bstore\s*\d+\b/g, " ")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\b(inc|ltd|limited|llc|pte|plc|gmbh|bv|nv|sa|ag|co|corp|company|store|branch)\b/g, " ")
    // A trailing bare number is a branch id, not part of the name.
    .replace(/\s+\d{1,6}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function learnCategory(
  memory: CategoryMemory,
  merchant: string,
  category: Category,
): CategoryMemory {
  const key = normaliseMerchantKey(merchant);
  if (!key) return memory;
  return { ...memory, [key]: category };
}

export function recallCategory(memory: CategoryMemory, merchant: string): Category | null {
  const key = normaliseMerchantKey(merchant);
  return (key && memory[key]) || null;
}

/** Memory first, then keywords, then `other`. */
export function resolveCategory(
  memory: CategoryMemory,
  merchant: string,
  text: string,
): Category {
  return recallCategory(memory, merchant) ?? suggestCategory(`${merchant}\n${text}`) ?? "other";
}
