import { parseAmountToMinor } from "../money.js";
import type { AiProviderConfig, ExpenseDraft } from "../models.js";
import { redactSensitive } from "../redact.js";
import { createAgentBridgeProvider } from "./providers/agentBridge.js";
import { createAnthropicProvider } from "./providers/anthropic.js";
import { createOllamaProvider } from "./providers/ollama.js";
import { createOpenAiCompatibleProvider } from "./providers/openaiCompatible.js";
import { AiRequestError, type AiCredentials, type AiProvider, type ExtractedReceipt } from "./types.js";

export * from "./types.js";
export * from "./endpoint.js";
export * from "./prompts.js";

export function createProvider(config: AiProviderConfig, credentials: AiCredentials): AiProvider {
  const runtime = {
    kind: config.kind,
    baseUrl: config.baseUrl,
    model: config.model,
    credentials,
  };
  switch (config.kind) {
    case "anthropic":
      return createAnthropicProvider(runtime);
    case "openai-compatible":
      return createOpenAiCompatibleProvider(runtime);
    case "ollama":
      return createOllamaProvider(runtime);
    case "agent-bridge":
      return createAgentBridgeProvider(runtime);
    case "none":
      throw new AiRequestError("No AI provider is configured. Add one in Settings.");
    default:
      throw new AiRequestError(`Unknown provider type "${config.kind as string}".`);
  }
}

/**
 * Prepare receipt text for a provider: redaction is applied here, once, so no
 * caller can forget it. Returns what was removed so the UI can say so.
 */
export function prepareTextForProvider(config: AiProviderConfig, text: string) {
  if (!config.redactBeforeSend) return { text, removed: {} as Record<string, number> };
  return redactSensitive(text);
}

/** Convert a validated model response into a draft the form can render. */
export function extractedToDraft(
  extracted: ExtractedReceipt,
  fallbackCurrency = "USD",
): ExpenseDraft {
  const currency = normaliseCurrency(extracted.currency) ?? fallbackCurrency;
  const toMinor = (value: string | null) =>
    value === null ? null : parseAmountToMinor(value, currency);

  const occurredAt = parseIsoLoose(extracted.occurredAt);

  return {
    merchant: extracted.merchant?.slice(0, 200) ?? "",
    occurredAt: occurredAt ?? undefined,
    currency,
    amountMinor: toMinor(extracted.total),
    taxMinor: toMinor(extracted.tax),
    tipMinor: toMinor(extracted.tip),
    category: extracted.category ?? "other",
    paymentMethod: extracted.paymentMethod ?? null,
    notes: extracted.notes?.slice(0, 1000) ?? "",
    source: "ai",
    extractionConfidence: extracted.confidence,
    reviewed: false,
    lineItems: extracted.lineItems.flatMap((item, index) => {
      const total = toMinor(item.total ?? null);
      if (total === null) return [];
      return [
        {
          id: `li-${index}`,
          description: item.description.slice(0, 300),
          quantity: item.quantity ?? 1,
          unitAmountMinor: null,
          totalAmountMinor: total,
          category: null,
        },
      ];
    }),
  };
}

function normaliseCurrency(value: string | null): string | null {
  if (!value) return null;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

function parseIsoLoose(value: string | null): string | null {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return null;
  const date = new Date(timestamp);
  // A model that hallucinates a date decades out is worse than no date.
  const year = date.getUTCFullYear();
  if (year < 1990 || date.getTime() > Date.now() + 36 * 3600 * 1000) return null;
  return date.toISOString();
}
