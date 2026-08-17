/** Byte/base64/hex helpers with no Node- or DOM-only dependencies. */
const B64_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
export function bytesToBase64(bytes) {
    let out = "";
    for (let i = 0; i < bytes.length; i += 3) {
        const b0 = bytes[i];
        const b1 = bytes[i + 1];
        const b2 = bytes[i + 2];
        out += B64_ALPHABET[b0 >> 2];
        out += B64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
        out += b1 === undefined ? "=" : B64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
        out += b2 === undefined ? "=" : B64_ALPHABET[b2 & 0x3f];
    }
    return out;
}
export function base64ToBytes(b64) {
    const clean = b64.replace(/[^A-Za-z0-9+/]/g, "");
    const len = Math.floor((clean.length * 3) / 4);
    const out = new Uint8Array(len);
    let outIndex = 0;
    for (let i = 0; i < clean.length; i += 4) {
        const c0 = B64_ALPHABET.indexOf(clean[i]);
        const c1 = B64_ALPHABET.indexOf(clean[i + 1]);
        const c2 = B64_ALPHABET.indexOf(clean[i + 2]);
        const c3 = B64_ALPHABET.indexOf(clean[i + 3]);
        if (c0 < 0 || c1 < 0)
            break;
        out[outIndex++] = (c0 << 2) | (c1 >> 4);
        if (c2 >= 0 && outIndex < len)
            out[outIndex++] = ((c1 & 0x0f) << 4) | (c2 >> 2);
        if (c3 >= 0 && outIndex < len)
            out[outIndex++] = ((c2 & 0x03) << 6) | c3;
    }
    return outIndex === len ? out : out.slice(0, outIndex);
}
export function bytesToHex(bytes) {
    let out = "";
    for (const b of bytes)
        out += b.toString(16).padStart(2, "0");
    return out;
}
export function utf8ToBytes(text) {
    return new TextEncoder().encode(text);
}
export function bytesToUtf8(bytes) {
    return new TextDecoder().decode(bytes);
}
export function concatBytes(...parts) {
    const total = parts.reduce((n, p) => n + p.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
    }
    return out;
}
/**
 * Comparison whose running time does not depend on where the first
 * difference is. Used for anything an attacker could probe repeatedly.
 */
export function timingSafeEqual(a, b) {
    if (a.length !== b.length)
        return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++)
        diff |= a[i] ^ b[i];
    return diff === 0;
}
/** Best-effort scrub of a buffer we are done with. */
export function wipe(bytes) {
    bytes.fill(0);
}
