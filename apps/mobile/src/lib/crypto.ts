import type { CryptoLike } from "@betapouch/core";

/**
 * WebCrypto on React Native.
 *
 * React Native has no `crypto.subtle`. The vault needs PBKDF2 and AES-GCM,
 * and both must be native — a pure-JS PBKDF2 at 600,000 iterations would take
 * the better part of a minute on a phone, which in practice means someone
 * lowers the iteration count and quietly destroys the security property.
 *
 * So: `react-native-quick-crypto` supplies a real, native WebCrypto. It is a
 * native module, which means the app runs in a development build or a release
 * build — not in Expo Go. That is the honest cost of doing the cryptography
 * properly, and it is the trade this project makes.
 *
 * If the module is missing, this FAILS CLOSED. It does not fall back to a
 * weaker KDF, and it does not store anything in the clear. An app that
 * silently degrades its encryption is worse than one that refuses to start,
 * because the user cannot tell the difference.
 */

let cached: CryptoLike | null = null;

export class CryptoUnavailableError extends Error {
  constructor(detail: string) {
    super(
      `BetaPouch cannot start without native cryptography. ${detail}\n\n` +
        "Install a development build (npx expo run:ios / run:android) rather than using Expo Go.",
    );
    this.name = "CryptoUnavailableError";
  }
}

export function getCrypto(): CryptoLike {
  if (cached) return cached;

  // Required lazily so the error surfaces as a handled startup failure rather
  // than a bundler-time crash with no explanation.
  let quickCrypto: { webcrypto?: unknown; install?: () => void };
  try {

    quickCrypto = require("react-native-quick-crypto") as typeof quickCrypto;
  } catch {
    throw new CryptoUnavailableError("The react-native-quick-crypto module is not installed.");
  }

  quickCrypto.install?.();

  const candidate = (quickCrypto.webcrypto ?? globalThis.crypto) as CryptoLike | undefined;
  if (!candidate?.subtle || typeof candidate.getRandomValues !== "function") {
    throw new CryptoUnavailableError("The installed crypto module exposes no SubtleCrypto.");
  }

  cached = candidate;
  return candidate;
}

/** Startup probe: proves the primitives actually work before any data is written. */
export async function verifyCrypto(): Promise<void> {
  const crypto = getCrypto();
  const key = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, [
    "encrypt",
    "decrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode("betapouch");
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key as CryptoKey, plaintext);
  const opened = new Uint8Array(
    await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key as CryptoKey, sealed),
  );
  if (new TextDecoder().decode(opened) !== "betapouch") {
    throw new CryptoUnavailableError("The crypto module failed a round-trip self-test.");
  }
}
