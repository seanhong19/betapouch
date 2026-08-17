import { base64ToBytes, bytesToBase64, bytesToHex, bytesToUtf8, concatBytes, utf8ToBytes, wipe } from "./bytes.js";

/**
 * The vault.
 *
 * Design, in one paragraph: a passphrase is stretched with PBKDF2 into a
 * key-encryption key (KEK). The KEK never encrypts data — it only wraps a
 * random 256-bit data-encryption key (DEK). Every record is sealed with
 * AES-GCM under the DEK using a fresh random IV, with additional
 * authenticated data binding the ciphertext to the store and record id it
 * lives at, so a ciphertext cannot be moved to a different row and still
 * verify. Changing the passphrase re-wraps the DEK and touches no records.
 *
 * The DEK exists only as a non-extractable CryptoKey held in memory while the
 * vault is unlocked. Locking drops the reference.
 */

export type CryptoLike = Pick<Crypto, "getRandomValues" | "subtle">;

export interface KdfParams {
  name: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  saltB64: string;
}

export interface VaultHeader {
  version: 1;
  kdf: KdfParams;
  /** DEK sealed under the KEK. */
  wrappedDek: { ivB64: string; ciphertextB64: string };
  createdAt: string;
  updatedAt: string;
}

export interface SealedBlob {
  ivB64: string;
  ciphertextB64: string;
}

/**
 * OWASP's 2024 floor for PBKDF2-HMAC-SHA256. Deliberately painful: this is
 * the only thing standing between a stolen device and the plaintext.
 */
export const DEFAULT_PBKDF2_ITERATIONS = 600_000;
const IV_BYTES = 12; // 96-bit nonce, the size AES-GCM is specified for
const SALT_BYTES = 16;
const DEK_BYTES = 32;
export const MIN_PASSPHRASE_LENGTH = 10;

function getCrypto(provided?: CryptoLike): CryptoLike {
  const c = provided ?? (globalThis.crypto as CryptoLike | undefined);
  if (!c?.subtle) {
    throw new Error(
      "WebCrypto is unavailable. BetaPouch requires a secure context (https:// or localhost).",
    );
  }
  return c;
}

function randomBytes(crypto: CryptoLike, length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

/**
 * AAD binds a ciphertext to its address. Re-filing an encrypted blob under a
 * different id or store makes decryption fail rather than silently succeed.
 */
function aadFor(store: string, recordId: string): Uint8Array {
  return utf8ToBytes(`betapouch:v1:${store}:${recordId}`);
}

async function deriveKek(
  crypto: CryptoLike,
  passphrase: string,
  kdf: KdfParams,
): Promise<CryptoKey> {
  const passphraseBytes = utf8ToBytes(passphrase.normalize("NFKC"));
  const material = await crypto.subtle.importKey("raw", toArrayBuffer(passphraseBytes), "PBKDF2", false, [
    "deriveKey",
  ]);
  wipe(passphraseBytes);
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toArrayBuffer(base64ToBytes(kdf.saltB64)),
      iterations: kdf.iterations,
      hash: kdf.hash,
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export interface PassphraseStrength {
  ok: boolean;
  score: 0 | 1 | 2 | 3 | 4;
  problems: string[];
}

/**
 * Length-first strength check. We do not impose character-class rules —
 * they push people toward `Password1!` — but we do reject the short and the
 * obviously guessable.
 */
export function assessPassphrase(passphrase: string): PassphraseStrength {
  const problems: string[] = [];
  const value = passphrase.normalize("NFKC");
  if (value.length < MIN_PASSPHRASE_LENGTH) {
    problems.push(`Use at least ${MIN_PASSPHRASE_LENGTH} characters.`);
  }
  const lowered = value.toLowerCase();
  const weak = ["password", "betapouch", "12345678", "qwerty", "letmein", "iloveyou", "admin"];
  if (weak.some((w) => lowered.includes(w))) {
    problems.push("Avoid common words and phrases an attacker would try first.");
  }
  if (/^(.)\1+$/.test(value)) problems.push("Avoid a single repeated character.");

  const variety =
    Number(/[a-z]/.test(value)) +
    Number(/[A-Z]/.test(value)) +
    Number(/\d/.test(value)) +
    Number(/[^\w\s]/.test(value)) +
    Number(/\s/.test(value));
  const lengthScore = value.length >= 20 ? 3 : value.length >= 16 ? 2 : value.length >= 12 ? 1 : 0;
  const raw = Math.min(4, lengthScore + (variety >= 3 ? 1 : 0));
  const score = (problems.length ? Math.min(raw, 1) : raw) as 0 | 1 | 2 | 3 | 4;
  return { ok: problems.length === 0, score, problems };
}

/** An unlocked vault: the header plus the in-memory DEK. */
export interface UnlockedVault {
  header: VaultHeader;
  /** Non-extractable AES-GCM key. Never serialise this. */
  dek: CryptoKey;
  crypto: CryptoLike;
}

export async function createVault(
  passphrase: string,
  options: { crypto?: CryptoLike; iterations?: number } = {},
): Promise<UnlockedVault> {
  const strength = assessPassphrase(passphrase);
  if (!strength.ok) throw new Error(strength.problems.join(" "));

  const crypto = getCrypto(options.crypto);
  const kdf: KdfParams = {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: options.iterations ?? DEFAULT_PBKDF2_ITERATIONS,
    saltB64: bytesToBase64(randomBytes(crypto, SALT_BYTES)),
  };
  const kek = await deriveKek(crypto, passphrase, kdf);

  const dekRaw = randomBytes(crypto, DEK_BYTES);
  const iv = randomBytes(crypto, IV_BYTES);
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aadFor("vault", "dek")) },
      kek,
      toArrayBuffer(dekRaw),
    ),
  );

  const dek = await crypto.subtle.importKey("raw", toArrayBuffer(dekRaw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  wipe(dekRaw);

  const now = new Date().toISOString();
  return {
    header: {
      version: 1,
      kdf,
      wrappedDek: { ivB64: bytesToBase64(iv), ciphertextB64: bytesToBase64(wrapped) },
      createdAt: now,
      updatedAt: now,
    },
    dek,
    crypto,
  };
}

export class WrongPassphraseError extends Error {
  constructor() {
    super("Incorrect passphrase.");
    this.name = "WrongPassphraseError";
  }
}

export async function unlockVault(
  header: VaultHeader,
  passphrase: string,
  options: { crypto?: CryptoLike } = {},
): Promise<UnlockedVault> {
  const crypto = getCrypto(options.crypto);
  if (header.version !== 1) throw new Error(`Unsupported vault version ${header.version}.`);

  const kek = await deriveKek(crypto, passphrase, header.kdf);
  let dekRaw: Uint8Array;
  try {
    dekRaw = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: toArrayBuffer(base64ToBytes(header.wrappedDek.ivB64)),
          additionalData: toArrayBuffer(aadFor("vault", "dek")),
        },
        kek,
        toArrayBuffer(base64ToBytes(header.wrappedDek.ciphertextB64)),
      ),
    );
  } catch {
    // GCM's auth tag is the passphrase check — there is no separate verifier
    // to leak, and a wrong passphrase is indistinguishable from tampering.
    throw new WrongPassphraseError();
  }

  const dek = await crypto.subtle.importKey("raw", toArrayBuffer(dekRaw), "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
  wipe(dekRaw);
  return { header, dek, crypto };
}

/** Re-wraps the same DEK under a new passphrase. Records are untouched. */
export async function changePassphrase(
  vault: UnlockedVault,
  currentPassphrase: string,
  newPassphrase: string,
  options: { iterations?: number } = {},
): Promise<VaultHeader> {
  const strength = assessPassphrase(newPassphrase);
  if (!strength.ok) throw new Error(strength.problems.join(" "));

  const { crypto } = vault;
  // Re-derive the old KEK so we can read the raw DEK out of the header. This
  // also proves the caller knows the current passphrase.
  const oldKek = await deriveKek(crypto, currentPassphrase, vault.header.kdf);
  let dekRaw: Uint8Array;
  try {
    dekRaw = new Uint8Array(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: toArrayBuffer(base64ToBytes(vault.header.wrappedDek.ivB64)),
          additionalData: toArrayBuffer(aadFor("vault", "dek")),
        },
        oldKek,
        toArrayBuffer(base64ToBytes(vault.header.wrappedDek.ciphertextB64)),
      ),
    );
  } catch {
    throw new WrongPassphraseError();
  }

  const kdf: KdfParams = {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: options.iterations ?? vault.header.kdf.iterations,
    saltB64: bytesToBase64(randomBytes(crypto, SALT_BYTES)),
  };
  const newKek = await deriveKek(crypto, newPassphrase, kdf);
  const iv = randomBytes(crypto, IV_BYTES);
  const wrapped = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aadFor("vault", "dek")) },
      newKek,
      toArrayBuffer(dekRaw),
    ),
  );
  wipe(dekRaw);

  return {
    ...vault.header,
    kdf,
    wrappedDek: { ivB64: bytesToBase64(iv), ciphertextB64: bytesToBase64(wrapped) },
    updatedAt: new Date().toISOString(),
  };
}

export async function sealBytes(
  vault: UnlockedVault,
  store: string,
  recordId: string,
  plaintext: Uint8Array,
): Promise<SealedBlob> {
  const iv = randomBytes(vault.crypto, IV_BYTES);
  const ct = new Uint8Array(
    await vault.crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aadFor(store, recordId)) },
      vault.dek,
      toArrayBuffer(plaintext),
    ),
  );
  return { ivB64: bytesToBase64(iv), ciphertextB64: bytesToBase64(ct) };
}

export async function openBytes(
  vault: UnlockedVault,
  store: string,
  recordId: string,
  blob: SealedBlob,
): Promise<Uint8Array> {
  const plain = await vault.crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: toArrayBuffer(base64ToBytes(blob.ivB64)),
      additionalData: toArrayBuffer(aadFor(store, recordId)),
    },
    vault.dek,
    toArrayBuffer(base64ToBytes(blob.ciphertextB64)),
  );
  return new Uint8Array(plain);
}

export async function sealJson<T>(
  vault: UnlockedVault,
  store: string,
  recordId: string,
  value: T,
): Promise<SealedBlob> {
  const bytes = utf8ToBytes(JSON.stringify(value));
  const sealed = await sealBytes(vault, store, recordId, bytes);
  wipe(bytes);
  return sealed;
}

export async function openJson<T>(
  vault: UnlockedVault,
  store: string,
  recordId: string,
  blob: SealedBlob,
): Promise<T> {
  const bytes = await openBytes(vault, store, recordId, blob);
  const text = bytesToUtf8(bytes);
  wipe(bytes);
  return JSON.parse(text) as T;
}

export async function sha256Hex(bytes: Uint8Array, provided?: CryptoLike): Promise<string> {
  const crypto = getCrypto(provided);
  const digest = await crypto.subtle.digest("SHA-256", toArrayBuffer(bytes));
  return bytesToHex(new Uint8Array(digest));
}

/** Passphrase-derived encryption for a standalone backup file. */
export async function encryptBackup(
  payload: unknown,
  passphrase: string,
  options: { crypto?: CryptoLike; iterations?: number } = {},
): Promise<{
  kdf: KdfParams;
  ivB64: string;
  ciphertextB64: string;
}> {
  const strength = assessPassphrase(passphrase);
  if (!strength.ok) throw new Error(strength.problems.join(" "));
  const crypto = getCrypto(options.crypto);
  const kdf: KdfParams = {
    name: "PBKDF2",
    hash: "SHA-256",
    iterations: options.iterations ?? DEFAULT_PBKDF2_ITERATIONS,
    saltB64: bytesToBase64(randomBytes(crypto, SALT_BYTES)),
  };
  const key = await deriveKek(crypto, passphrase, kdf);
  const iv = randomBytes(crypto, IV_BYTES);
  const plaintext = utf8ToBytes(JSON.stringify(payload));
  const ct = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: toArrayBuffer(iv), additionalData: toArrayBuffer(aadFor("backup", "v1")) },
      key,
      toArrayBuffer(plaintext),
    ),
  );
  wipe(plaintext);
  return { kdf, ivB64: bytesToBase64(iv), ciphertextB64: bytesToBase64(ct) };
}

export async function decryptBackup<T>(
  envelope: { kdf: KdfParams; ivB64: string; ciphertextB64: string },
  passphrase: string,
  options: { crypto?: CryptoLike } = {},
): Promise<T> {
  const crypto = getCrypto(options.crypto);
  const key = await deriveKek(crypto, passphrase, envelope.kdf);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: toArrayBuffer(base64ToBytes(envelope.ivB64)),
        additionalData: toArrayBuffer(aadFor("backup", "v1")),
      },
      key,
      toArrayBuffer(base64ToBytes(envelope.ciphertextB64)),
    );
  } catch {
    throw new WrongPassphraseError();
  }
  return JSON.parse(bytesToUtf8(new Uint8Array(plain))) as T;
}

export { concatBytes };
