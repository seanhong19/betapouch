import { z } from "zod";

/**
 * Domain models. Every record that crosses a trust boundary (storage, import,
 * AI output, backup file) is validated through these schemas before use —
 * parsing is the validation layer, not an afterthought.
 */

export const CATEGORIES = [
  "groceries",
  "dining",
  "transport",
  "housing",
  "utilities",
  "health",
  "shopping",
  "entertainment",
  "travel",
  "education",
  "business",
  "fees",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];
export const categorySchema = z.enum(CATEGORIES);

export const CATEGORY_LABELS: Record<Category, string> = {
  groceries: "Groceries",
  dining: "Dining",
  transport: "Transport",
  housing: "Housing",
  utilities: "Utilities",
  health: "Health",
  shopping: "Shopping",
  entertainment: "Entertainment",
  travel: "Travel",
  education: "Education",
  business: "Business",
  fees: "Fees & charges",
  other: "Other",
};

export const PAYMENT_METHODS = ["cash", "card", "bank", "wallet", "other"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const paymentMethodSchema = z.enum(PAYMENT_METHODS);

/** How an expense's data got into the app. Kept for auditability. */
export const SOURCES = ["manual", "camera", "upload", "ocr", "ai", "import"] as const;
export type Source = (typeof SOURCES)[number];
export const sourceSchema = z.enum(SOURCES);

const isoDateTime = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), { message: "Invalid ISO date-time" });

const currencyCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO 4217 code");

/** Amounts are integer minor units. See money.ts. */
const minorUnits = z.number().int().finite();

export const lineItemSchema = z.object({
  id: z.string().min(1),
  description: z.string().trim().max(300),
  quantity: z.number().finite().nonnegative().max(1_000_000).default(1),
  unitAmountMinor: minorUnits.nullable().default(null),
  totalAmountMinor: minorUnits,
  category: categorySchema.nullable().default(null),
});
export type LineItem = z.infer<typeof lineItemSchema>;

export const attachmentSchema = z.object({
  id: z.string().min(1),
  /** Only image/* and application/pdf are ever accepted. */
  mimeType: z.string().regex(/^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/),
  byteSize: z.number().int().nonnegative(),
  width: z.number().int().positive().nullable().default(null),
  height: z.number().int().positive().nullable().default(null),
  /** Original filename, sanitised — display only, never used as a path. */
  filename: z.string().max(255).nullable().default(null),
  createdAt: isoDateTime,
  /** SHA-256 of the plaintext bytes, for dedupe and integrity checks. */
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export type Attachment = z.infer<typeof attachmentSchema>;

export const expenseSchema = z.object({
  id: z.string().min(1),
  /** When the money was spent (not when the record was made). */
  occurredAt: isoDateTime,
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
  merchant: z.string().trim().max(200).default(""),
  description: z.string().trim().max(1000).default(""),
  amountMinor: minorUnits,
  currency: currencyCode.default("USD"),
  taxMinor: minorUnits.nullable().default(null),
  tipMinor: minorUnits.nullable().default(null),
  category: categorySchema.default("other"),
  paymentMethod: paymentMethodSchema.nullable().default(null),
  tags: z.array(z.string().trim().min(1).max(40)).max(30).default([]),
  notes: z.string().max(4000).default(""),
  lineItems: z.array(lineItemSchema).max(200).default([]),
  attachmentIds: z.array(z.string().min(1)).max(20).default([]),
  source: sourceSchema.default("manual"),
  /** Raw OCR text, kept locally so a re-parse never needs the network. */
  ocrText: z.string().max(20_000).nullable().default(null),
  /** 0..1 — how sure the extractor was. null when a human typed it. */
  extractionConfidence: z.number().min(0).max(1).nullable().default(null),
  /** Set when the user has eyeballed an auto-extracted record. */
  reviewed: z.boolean().default(false),
});
export type Expense = z.infer<typeof expenseSchema>;

/** A draft is what the scanner/AI produces; the user confirms it into an Expense. */
export const expenseDraftSchema = expenseSchema
  .partial()
  .extend({ amountMinor: minorUnits.nullable().default(null) });
export type ExpenseDraft = z.infer<typeof expenseDraftSchema>;

export const AI_PROVIDER_KINDS = [
  "none",
  "anthropic",
  "openai-compatible",
  "ollama",
  "agent-bridge",
] as const;
export type AiProviderKind = (typeof AI_PROVIDER_KINDS)[number];

export const aiProviderConfigSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(AI_PROVIDER_KINDS),
  label: z.string().trim().max(80).default(""),
  /** Must be https:// unless it points at loopback. Enforced in ai/endpoint.ts. */
  baseUrl: z.string().url().nullable().default(null),
  model: z.string().trim().max(120).default(""),
  /** Never persisted in the clear — held in the encrypted secrets store. */
  hasApiKey: z.boolean().default(false),
  /** Strip likely-PII from text before it leaves the device. */
  redactBeforeSend: z.boolean().default(true),
  /** Send the receipt image itself (vision models). Off by default. */
  allowImageUpload: z.boolean().default(false),
});
export type AiProviderConfig = z.infer<typeof aiProviderConfigSchema>;

export const settingsSchema = z.object({
  baseCurrency: currencyCode.default("USD"),
  locale: z.string().max(35).default("en-US"),
  /** Minutes of inactivity before the vault re-locks. 0 disables auto-lock. */
  autoLockMinutes: z.number().int().min(0).max(1440).default(10),
  lockOnHide: z.boolean().default(true),
  /** On-device OCR. Nothing leaves the device for this. */
  ocrEnabled: z.boolean().default(true),
  ocrLanguage: z.string().max(20).default("eng"),
  aiProviders: z.array(aiProviderConfigSchema).max(10).default([]),
  activeAiProviderId: z.string().nullable().default(null),
  theme: z.enum(["system", "light", "dark"]).default("system"),
  /** Drop GPS/EXIF metadata from imported images. Strongly recommended. */
  stripImageMetadata: z.boolean().default(true),
});
export type Settings = z.infer<typeof settingsSchema>;

export const defaultSettings = (): Settings => settingsSchema.parse({});

export const chatMessageSchema = z.object({
  id: z.string().min(1),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(100_000),
  createdAt: isoDateTime,
  /** Provider id that produced an assistant turn, for transparency. */
  providerId: z.string().nullable().default(null),
});
export type ChatMessage = z.infer<typeof chatMessageSchema>;

/** The envelope written to a backup file. Payload is ciphertext. */
export const backupEnvelopeSchema = z.object({
  format: z.literal("betapouch-backup"),
  version: z.literal(1),
  createdAt: isoDateTime,
  kdf: z.object({
    name: z.literal("PBKDF2"),
    hash: z.literal("SHA-256"),
    iterations: z.number().int().min(100_000),
    saltB64: z.string().min(1),
  }),
  cipher: z.literal("AES-GCM"),
  ivB64: z.string().min(1),
  ciphertextB64: z.string().min(1),
});
export type BackupEnvelope = z.infer<typeof backupEnvelopeSchema>;

export const backupPayloadSchema = z.object({
  expenses: z.array(expenseSchema),
  settings: settingsSchema,
  /** Attachments are exported separately when large; inline is optional. */
  attachments: z
    .array(attachmentSchema.extend({ dataB64: z.string() }))
    .default([]),
});
export type BackupPayload = z.infer<typeof backupPayloadSchema>;
