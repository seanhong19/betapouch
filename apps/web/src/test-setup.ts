/**
 * jsdom implements neither object URLs nor WebCrypto's SubtleCrypto. Both are
 * real browser APIs the app depends on, so they are stubbed/bridged here
 * rather than worked around in the code under test.
 */
import { webcrypto } from "node:crypto";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });
}

let counter = 0;
if (typeof URL.createObjectURL !== "function") {
  URL.createObjectURL = () => `blob:betapouch-test/${++counter}`;
  URL.revokeObjectURL = () => undefined;
}
