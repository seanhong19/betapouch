/** Identifiers are random, never sequential — a record id should not tell an
 *  observer how many records exist or in what order they were made. */
export function newId(prefix = "exp"): string {
  const bytes = new Uint8Array(16);
  const cryptoObj = globalThis.crypto;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    throw new Error("A secure random source is required.");
  }
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return `${prefix}_${hex}`;
}
