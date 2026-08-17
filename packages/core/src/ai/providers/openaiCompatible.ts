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

const DEFAULT_BASE_URL = "https://api.openai.com/v1";

interface ChatCompletionResponse {
  choices?: { message?: { content?: string | null } }[];
}

function textOf(response: unknown): string {
  const content = (response as ChatCompletionResponse).choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new AiRequestError("The model returned an empty response.");
  }
  return content;
}

/**
 * Any OpenAI-chat-completions-compatible endpoint: OpenAI itself, OpenRouter,
 * Groq, Together, LM Studio, llama.cpp's server, vLLM. One adapter covers all
 * of them because they all speak the same shape.
 */
export function createOpenAiCompatibleProvider(config: AiRuntimeConfig): AiProvider {
  const baseUrl = config.baseUrl?.trim() || DEFAULT_BASE_URL;
  const url = assertSafeEndpoint(baseUrl);
  const model = config.model?.trim();
  if (!model) throw new AiRequestError("No model configured for this provider.");

  const apiKey = config.credentials.apiKey?.trim();
  // A local server (LM Studio, llama.cpp) legitimately has no key.
  const headers: Record<string, string> = apiKey ? { authorization: `Bearer ${apiKey}` } : {};

  const send = async (body: Record<string, unknown>, signal?: AbortSignal) =>
    textOf(
      await postJson(joinUrl(baseUrl, "chat/completions"), body, headers, {
        signal,
        timeoutMs: config.timeoutMs,
      }),
    );

  return {
    kind: "openai-compatible",
    destination: () => describeDestination(url.toString()),

    async chat(request: ChatRequest): Promise<string> {
      return send(
        {
          model,
          max_tokens: request.maxTokens ?? 1024,
          messages: [
            { role: "system", content: request.system },
            ...request.messages.map((m) => ({ role: m.role, content: m.content })),
          ],
        },
        request.signal,
      );
    },

    async extract(request: ExtractRequest): Promise<ExtractedReceipt> {
      const content: unknown[] = [];
      if (request.image) {
        content.push({
          type: "image_url",
          image_url: { url: `data:${request.image.mimeType};base64,${request.image.dataB64}` },
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
          // Honoured by OpenAI and most compatible servers; harmless elsewhere
          // because we tolerate prose around the JSON anyway.
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
            { role: "user", content: request.image ? content : (content[0] as { text: string }).text },
          ],
        },
        request.signal,
      );
      return parseExtraction(raw);
    },
  };
}
