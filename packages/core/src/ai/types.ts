import { z } from "zod";
import { CATEGORIES, PAYMENT_METHODS } from "../models.js";

export interface AiCredentials {
  apiKey?: string;
  /** Bearer token for the local agent bridge. */
  bridgeToken?: string;
}

export interface AiRuntimeConfig {
  kind: string;
  baseUrl: string | null;
  model: string;
  credentials: AiCredentials;
  /** Hard ceiling on how long any single request may run. */
  timeoutMs?: number;
}

export interface AiChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  system: string;
  messages: AiChatTurn[];
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface ExtractRequest {
  /** OCR text, already redacted if the provider config says so. */
  text: string;
  /** Optional base64 image, only when the user enabled image upload. */
  image?: { mimeType: string; dataB64: string };
  signal?: AbortSignal;
}

export interface AiProvider {
  readonly kind: string;
  /** Where data goes, for the consent prompt. Null for on-device providers. */
  destination(): string | null;
  chat(request: ChatRequest): Promise<string>;
  extract(request: ExtractRequest): Promise<ExtractedReceipt>;
}

/** What a model is allowed to return. Anything else is rejected. */
export const extractedReceiptSchema = z.object({
  merchant: z.string().max(200).nullable().default(null),
  /** ISO 8601 date or date-time. */
  occurredAt: z.string().max(40).nullable().default(null),
  currency: z.string().max(3).nullable().default(null),
  /** Decimal strings, not floats — the app converts to minor units itself. */
  total: z.string().max(24).nullable().default(null),
  subtotal: z.string().max(24).nullable().default(null),
  tax: z.string().max(24).nullable().default(null),
  tip: z.string().max(24).nullable().default(null),
  category: z.enum(CATEGORIES).nullable().default(null),
  paymentMethod: z.enum(PAYMENT_METHODS).nullable().default(null),
  notes: z.string().max(1000).nullable().default(null),
  lineItems: z
    .array(
      z.object({
        description: z.string().max(200),
        quantity: z.number().finite().nonnegative().max(100000).nullable().default(null),
        total: z.string().max(24).nullable().default(null),
      }),
    )
    .max(100)
    .default([]),
  confidence: z.number().min(0).max(1).nullable().default(null),
});
export type ExtractedReceipt = z.infer<typeof extractedReceiptSchema>;

export class AiRequestError extends Error {
  readonly status: number | null;
  constructor(message: string, status: number | null = null) {
    super(message);
    this.name = "AiRequestError";
    this.status = status;
  }
}

export const DEFAULT_TIMEOUT_MS = 60_000;
/** Refuse absurd response bodies rather than trying to parse them. */
export const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;

/**
 * Model output is untrusted input. It arrives wrapped in prose, fenced code,
 * or trailing commentary; we scan for the outermost balanced JSON object
 * rather than trusting the whole body to be JSON.
 */
export function extractJsonObject(raw: string): unknown {
  const text = raw.trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], text].filter((c): c is string => typeof c === "string");

  for (const candidate of candidates) {
    const start = candidate.indexOf("{");
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i];
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        if (inString) escaped = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(candidate.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
  }
  throw new AiRequestError("The model did not return usable JSON.");
}

export function parseExtraction(raw: string): ExtractedReceipt {
  return extractedReceiptSchema.parse(extractJsonObject(raw));
}
