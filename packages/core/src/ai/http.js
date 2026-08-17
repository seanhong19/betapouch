import { AiRequestError, DEFAULT_TIMEOUT_MS, MAX_RESPONSE_BYTES } from "./types.js";
/**
 * The single place an outbound request is made. Everything funnels through
 * here so the timeout, the size cap, and the "never log the body" rule hold
 * for every provider.
 */
export async function postJson(url, body, headers, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const onAbort = () => controller.abort();
    options.signal?.addEventListener("abort", onAbort, { once: true });
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", ...headers },
            body: JSON.stringify(body),
            signal: controller.signal,
            // No cookies, no credentials — the API key is the only auth we send.
            credentials: "omit",
            cache: "no-store",
            referrerPolicy: "no-referrer",
            mode: "cors",
        });
        const text = await readCapped(response);
        if (!response.ok) {
            throw new AiRequestError(summariseError(response.status, text), response.status);
        }
        try {
            return JSON.parse(text);
        }
        catch {
            throw new AiRequestError("The provider returned a response that was not JSON.", response.status);
        }
    }
    catch (error) {
        if (error instanceof AiRequestError)
            throw error;
        if (error?.name === "AbortError") {
            throw new AiRequestError("The request timed out or was cancelled.");
        }
        // Deliberately generic: a network error message can carry the URL and any
        // query string with it, and those may contain a key.
        throw new AiRequestError("Could not reach the provider. Check the endpoint and your connection.");
    }
    finally {
        clearTimeout(timeout);
        options.signal?.removeEventListener("abort", onAbort);
    }
}
async function readCapped(response) {
    const reader = response.body?.getReader();
    if (!reader)
        return response.text();
    const chunks = [];
    let total = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done)
            break;
        total += value.byteLength;
        if (total > MAX_RESPONSE_BYTES) {
            await reader.cancel();
            throw new AiRequestError("The provider's response was too large to process.");
        }
        chunks.push(value);
    }
    const merged = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        merged.set(chunk, offset);
        offset += chunk.length;
    }
    return new TextDecoder().decode(merged);
}
/**
 * Turn a provider error into something actionable without echoing the raw
 * body — provider errors sometimes quote the request back, key included.
 */
function summariseError(status, body) {
    const known = {
        400: "The provider rejected the request (bad request). Check the model name.",
        401: "Authentication failed. Check the API key.",
        403: "The provider refused the request (forbidden). The key may lack access to this model.",
        404: "Endpoint or model not found. Check the base URL and model name.",
        413: "The request was too large. Try without the image, or a shorter receipt.",
        429: "Rate limited by the provider. Wait a moment and try again.",
    };
    if (known[status])
        return known[status];
    if (status >= 500)
        return `The provider had a server error (${status}). Try again later.`;
    // Fall back to the provider's own short message if it looks like one.
    try {
        const parsed = JSON.parse(body);
        const message = typeof parsed.error === "string" ? parsed.error : parsed.error?.message;
        if (typeof message === "string" && message.length < 200)
            return `Provider error: ${message}`;
    }
    catch {
        /* fall through */
    }
    return `The provider returned an error (${status}).`;
}
