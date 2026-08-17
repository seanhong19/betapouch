import { assertSafeEndpoint, describeDestination, isLoopback, joinUrl } from "../endpoint.js";
import { postJson } from "../http.js";
import { buildExtractionUserPrompt, EXTRACTION_SYSTEM_PROMPT, IMAGE_EXTRACTION_PROMPT, } from "../prompts.js";
import { AiRequestError, parseExtraction, } from "../types.js";
const DEFAULT_BASE_URL = "http://localhost:11434";
/**
 * Ollama running on the user's own machine. This is the recommended setup for
 * anyone who wants AI extraction with nothing at all leaving the device: the
 * model runs locally, so "BYOK" becomes "bring your own hardware".
 */
export function createOllamaProvider(config) {
    const baseUrl = config.baseUrl?.trim() || DEFAULT_BASE_URL;
    const url = assertSafeEndpoint(baseUrl);
    const model = config.model?.trim() || "llama3.2-vision";
    return {
        kind: "ollama",
        destination: () => (isLoopback(url) ? null : describeDestination(baseUrl)),
        async chat(request) {
            const response = (await postJson(joinUrl(baseUrl, "api/chat"), {
                model,
                stream: false,
                options: { num_predict: request.maxTokens ?? 1024 },
                messages: [
                    { role: "system", content: request.system },
                    ...request.messages.map((m) => ({ role: m.role, content: m.content })),
                ],
            }, {}, { signal: request.signal, timeoutMs: config.timeoutMs }));
            const content = response.message?.content;
            if (!content?.trim())
                throw new AiRequestError("The local model returned an empty response.");
            return content;
        },
        async extract(request) {
            const userContent = request.image
                ? IMAGE_EXTRACTION_PROMPT
                : buildExtractionUserPrompt(request.text);
            const response = (await postJson(joinUrl(baseUrl, "api/chat"), {
                model,
                stream: false,
                format: "json",
                options: { num_predict: 2048 },
                messages: [
                    { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
                    {
                        role: "user",
                        content: request.text.trim() ? `${userContent}\n\n${request.text}` : userContent,
                        ...(request.image ? { images: [request.image.dataB64] } : {}),
                    },
                ],
            }, {}, { signal: request.signal, timeoutMs: config.timeoutMs }));
            const content = response.message?.content;
            if (!content?.trim())
                throw new AiRequestError("The local model returned an empty response.");
            return parseExtraction(content);
        },
    };
}
