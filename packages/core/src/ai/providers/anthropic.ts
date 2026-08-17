import { assertSafeEndpoint, describeDestination, joinUrl } from "../endpoint.js";
import { postJson } from "../http.js";
import {
  buildExtractionUserPrompt,
  EXTRACTION_SYSTEM_PROMPT,
  IMAGE_EXTRACTION_PROMPT,
} from "../prompts.js";
import {
  AiRequestError,
  parseExtraction,
  type AiProvider,
  type AiRuntimeConfig,
  type ChatRequest,
  type ExtractRequest,
  type ExtractedReceipt,
} from "../types.js";

const DEFAULT_BASE_URL = "https://api.anthropic.com";
export const DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-5";

interface AnthropicResponse {
  content?: { type: string; text?: string }[];
}

function textOf(response: unknown): string {
  const blocks = (response as AnthropicResponse).content ?? [];
  const text = blocks
    .filter((b) => b.type === "text" && typeof b.text === "string")
    .map((b) => b.text as string)
    .join("");
  if (!text) throw new AiRequestError("The model returned an empty response.");
  return text;
}

/**
 * Anthropic Messages API, called directly from the client with the user's own
 * key. `anthropic-dangerous-direct-browser-access` is what makes a
 * browser-origin call possible at all; it is exactly the trade this app is
 * built around — the key stays on the user's device instead of living on a
 * relay server we would have to be trusted with.
 */
export function createAnthropicProvider(config: AiRuntimeConfig): AiProvider {
  const baseUrl = config.baseUrl?.trim() || DEFAULT_BASE_URL;
  assertSafeEndpoint(baseUrl);
  const model = config.model?.trim() || DEFAULT_ANTHROPIC_MODEL;
  const apiKey = config.credentials.apiKey?.trim();
  if (!apiKey) throw new AiRequestError("No Anthropic API key configured.");

  const headers = {
    "x-api-key": apiKey,
    "anthropic-version": "2023-06-01",
    "anthropic-dangerous-direct-browser-access": "true",
  };

  const send = async (body: Record<string, unknown>, signal?: AbortSignal) =>
    textOf(
      await postJson(joinUrl(baseUrl, "v1/messages"), body, headers, {
        signal,
        timeoutMs: config.timeoutMs,
      }),
    );

  return {
    kind: "anthropic",
    destination: () => describeDestination(baseUrl),

    async chat(request: ChatRequest): Promise<string> {
      return send(
        {
          model,
          max_tokens: request.maxTokens ?? 1024,
          system: request.system,
          messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        },
        request.signal,
      );
    },

    async extract(request: ExtractRequest): Promise<ExtractedReceipt> {
      const content: unknown[] = [];
      if (request.image) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: request.image.mimeType,
            data: request.image.dataB64,
          },
        });
        content.push({ type: "text", text: IMAGE_EXTRACTION_PROMPT });
      }
      if (request.text.trim()) {
        content.push({ type: "text", text: buildExtractionUserPrompt(request.text) });
      }
      if (content.length === 0) throw new AiRequestError("Nothing to extract from.");

      const raw = await send(
        {
          model,
          max_tokens: 2048,
          system: EXTRACTION_SYSTEM_PROMPT,
          messages: [{ role: "user", content }],
        },
        request.signal,
      );
      return parseExtraction(raw);
    },
  };
}
