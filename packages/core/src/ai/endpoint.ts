/**
 * Endpoint policy for every outbound AI request.
 *
 * The app makes no network calls of its own. The only requests it ever makes
 * are the ones a user configured, so the rule is narrow and explicit:
 * plaintext HTTP is allowed to loopback only (a local Ollama or the agent
 * bridge); everything else must be https. Anything else is refused loudly
 * rather than downgraded silently.
 */

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1", "0.0.0.0"]);

export class UnsafeEndpointError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsafeEndpointError";
  }
}

export function isLoopback(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  if (LOOPBACK_HOSTS.has(host)) return true;
  if (host.endsWith(".localhost")) return true;
  return /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host);
}

export function assertSafeEndpoint(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new UnsafeEndpointError(`"${rawUrl}" is not a valid URL.`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new UnsafeEndpointError(`Unsupported scheme "${url.protocol}". Use https://.`);
  }
  if (url.protocol === "http:" && !isLoopback(url)) {
    throw new UnsafeEndpointError(
      `Refusing to send your data over plaintext HTTP to ${url.hostname}. Use https:// (plain http is allowed for localhost only).`,
    );
  }
  if (url.username || url.password) {
    throw new UnsafeEndpointError("Credentials in the URL are not supported — use the API key field.");
  }
  return url;
}

/** Join a configured base URL with a path without letting the path escape it. */
export function joinUrl(baseUrl: string, path: string): string {
  const base = assertSafeEndpoint(baseUrl);
  const basePath = base.pathname.endsWith("/") ? base.pathname : `${base.pathname}/`;
  const suffix = path.replace(/^\/+/, "");
  const joined = new URL(basePath + suffix, base.origin);
  joined.search = base.search;
  return joined.toString();
}

/** A short, human-readable description of where data is about to go. */
export function describeDestination(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    return isLoopback(url) ? `${url.host} (this device)` : url.host;
  } catch {
    return rawUrl;
  }
}
