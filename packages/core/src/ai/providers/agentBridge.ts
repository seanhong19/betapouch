import { assertSafeEndpoint, describeDestination, isLoopback, joinUrl } from "../endpoint.js";
import { postJson } from "../http.js";
import { buildExtractionUserPrompt, EXTRACTION_SYSTEM_PROMPT } from "../prompts.js";
import {
  AiRequestError,
  parseExtraction,
  type AiProvider,
  type AiRuntimeConfig,
  type ChatRequest,
  type ExtractRequest,
  type ExtractedReceipt,
} from "../types.js";

const DEFAULT_BASE_URL = "http://127.0.0.1:4747";

interface BridgeResponse {
  text?: string;
  error?: string;
}

/**
 * The agent bridge: a sidecar the user runs on their own machine
 * (`pnpm bridge`) that shells out to an agent CLI they already have — Claude
 * Code, Codex, or anything else they configure. It means a user with a
 * subscription needs no API key at all.
 *
 * The bridge refuses non-loopback binds and requires a bearer token, so the
 * client refuses to talk to a non-loopback bridge too: a "bridge" on a remote
 * host would be an arbitrary third party reading every receipt.
 */
export function createAgentBridgeProvider(config: AiRuntimeConfig): AiProvider {
  const baseUrl = config.baseUrl?.trim() || DEFAULT_BASE_URL;
  const url = assertSafeEndpoint(baseUrl);
  if (!isLoopback(url)) {
    throw new AiRequestError(
      "The agent bridge must run on this device (localhost). Remote bridges are not allowed.",
    );
  }
  const token = config.credentials.bridgeToken?.trim();
  if (!token) throw new AiRequestError("No bridge token configured. Start the bridge to get one.");

  const headers = { authorization: `Bearer ${token}` };
  const agent = config.model?.trim() || "claude";

  const send = async (
    system: string,
    prompt: string,
    signal: AbortSignal | undefined,
  ): Promise<string> => {
    const response = (await postJson(
      joinUrl(baseUrl, "v1/run"),
      { agent, system, prompt },
      headers,
      { signal, timeoutMs: config.timeoutMs ?? 180_000 },
    )) as BridgeResponse;
    if (response.error) throw new AiRequestError(`Agent bridge: ${response.error}`);
    if (!response.text?.trim()) throw new AiRequestError("The agent returned an empty response.");
    return response.text;
  };

  return {
    kind: "agent-bridge",
    destination: () => (isLoopback(url) ? null : describeDestination(baseUrl)),

    async chat(request: ChatRequest): Promise<string> {
      const transcript = request.messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n\n");
      return send(request.system, transcript, request.signal);
    },

    async extract(request: ExtractRequest): Promise<ExtractedReceipt> {
      if (!request.text.trim()) {
        // The bridge is text-only by design: handing a local CLI an image
        // would mean writing the receipt to disk outside the vault.
        throw new AiRequestError(
          "The agent bridge works from OCR text. Enable on-device OCR, or use a vision provider.",
        );
      }
      const raw = await send(
        EXTRACTION_SYSTEM_PROMPT,
        buildExtractionUserPrompt(request.text),
        request.signal,
      );
      return parseExtraction(raw);
    },
  };
}
