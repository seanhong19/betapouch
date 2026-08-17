import { webcrypto } from "node:crypto";
import { describe, expect, it } from "vitest";
import { base64ToBytes, bytesToBase64, timingSafeEqual, utf8ToBytes } from "./bytes.js";
import {
  assessPassphrase,
  changePassphrase,
  createVault,
  decryptBackup,
  encryptBackup,
  openBytes,
  openJson,
  sealBytes,
  sealJson,
  sha256Hex,
  unlockVault,
  WrongPassphraseError,
  type CryptoLike,
} from "./vault.js";

const crypto = webcrypto as unknown as CryptoLike;
// Tests use a low iteration count for speed; production uses 600k.
const iterations = 1000;
const PASSPHRASE = "correct horse battery staple";

describe("base64", () => {
  it("round-trips arbitrary bytes", () => {
    for (const length of [0, 1, 2, 3, 16, 17, 255]) {
      const bytes = new Uint8Array(length).map((_, i) => (i * 37) % 256);
      expect(base64ToBytes(bytesToBase64(bytes))).toEqual(bytes);
    }
  });

  it("matches Node's encoder", () => {
    const bytes = utf8ToBytes("héllo wörld ✓");
    expect(bytesToBase64(bytes)).toBe(Buffer.from(bytes).toString("base64"));
  });
});

describe("timingSafeEqual", () => {
  it("compares by content", () => {
    expect(timingSafeEqual(utf8ToBytes("abc"), utf8ToBytes("abc"))).toBe(true);
    expect(timingSafeEqual(utf8ToBytes("abc"), utf8ToBytes("abd"))).toBe(false);
    expect(timingSafeEqual(utf8ToBytes("abc"), utf8ToBytes("abcd"))).toBe(false);
  });
});

describe("assessPassphrase", () => {
  it("rejects short passphrases", () => {
    expect(assessPassphrase("short").ok).toBe(false);
  });

  it("rejects obvious guesses", () => {
    expect(assessPassphrase("mypassword123").ok).toBe(false);
    expect(assessPassphrase("betapouch2025").ok).toBe(false);
  });

  it("accepts a long passphrase and scores it well", () => {
    const result = assessPassphrase("correct horse battery staple");
    expect(result.ok).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(3);
  });
});

describe("vault", () => {
  it("seals and opens JSON round-trip", async () => {
    const vault = await createVault(PASSPHRASE, { crypto, iterations });
    const record = { merchant: "Kopi Shop", amountMinor: 450 };
    const sealed = await sealJson(vault, "expenses", "exp_1", record);
    expect(sealed.ciphertextB64).not.toContain("Kopi");
    await expect(openJson(vault, "expenses", "exp_1", sealed)).resolves.toEqual(record);
  });

  it("uses a fresh IV for every seal", async () => {
    const vault = await createVault(PASSPHRASE, { crypto, iterations });
    const a = await sealJson(vault, "expenses", "exp_1", { v: 1 });
    const b = await sealJson(vault, "expenses", "exp_1", { v: 1 });
    expect(a.ivB64).not.toBe(b.ivB64);
    expect(a.ciphertextB64).not.toBe(b.ciphertextB64);
  });

  it("refuses a ciphertext moved to a different record id", async () => {
    const vault = await createVault(PASSPHRASE, { crypto, iterations });
    const sealed = await sealJson(vault, "expenses", "exp_1", { amountMinor: 100 });
    await expect(openJson(vault, "expenses", "exp_2", sealed)).rejects.toThrow();
    await expect(openJson(vault, "secrets", "exp_1", sealed)).rejects.toThrow();
  });

  it("refuses a tampered ciphertext", async () => {
    const vault = await createVault(PASSPHRASE, { crypto, iterations });
    const sealed = await sealBytes(vault, "expenses", "exp_1", utf8ToBytes("hello"));
    const bytes = base64ToBytes(sealed.ciphertextB64);
    bytes[0] = (bytes[0] as number) ^ 0xff;
    await expect(
      openBytes(vault, "expenses", "exp_1", { ...sealed, ciphertextB64: bytesToBase64(bytes) }),
    ).rejects.toThrow();
  });

  it("unlocks with the right passphrase and rejects the wrong one", async () => {
    const vault = await createVault(PASSPHRASE, { crypto, iterations });
    const sealed = await sealJson(vault, "expenses", "exp_1", { amountMinor: 999 });

    const reopened = await unlockVault(vault.header, PASSPHRASE, { crypto });
    await expect(openJson(reopened, "expenses", "exp_1", sealed)).resolves.toEqual({
      amountMinor: 999,
    });

    await expect(unlockVault(vault.header, "wrong passphrase entirely", { crypto })).rejects.toThrow(
      WrongPassphraseError,
    );
  });

  it("re-wraps the key on passphrase change without touching records", async () => {
    const vault = await createVault(PASSPHRASE, { crypto, iterations });
    const sealed = await sealJson(vault, "expenses", "exp_1", { amountMinor: 1500 });

    const nextPassphrase = "an entirely different long passphrase";
    const header = await changePassphrase(vault, PASSPHRASE, nextPassphrase, { iterations });

    await expect(unlockVault(header, PASSPHRASE, { crypto })).rejects.toThrow(WrongPassphraseError);
    const reopened = await unlockVault(header, nextPassphrase, { crypto });
    // The same records still decrypt — the DEK survived the re-wrap.
    await expect(openJson(reopened, "expenses", "exp_1", sealed)).resolves.toEqual({
      amountMinor: 1500,
    });
    expect(header.kdf.saltB64).not.toBe(vault.header.kdf.saltB64);
  });

  it("rejects a passphrase change made with the wrong current passphrase", async () => {
    const vault = await createVault(PASSPHRASE, { crypto, iterations });
    await expect(
      changePassphrase(vault, "not the current one", "a brand new long passphrase", { iterations }),
    ).rejects.toThrow(WrongPassphraseError);
  });

  it("refuses to create a vault behind a weak passphrase", async () => {
    await expect(createVault("short", { crypto, iterations })).rejects.toThrow();
  });
});

describe("backup", () => {
  it("round-trips an encrypted backup", async () => {
    const payload = { expenses: [{ id: "exp_1", amountMinor: 250 }] };
    const envelope = await encryptBackup(payload, PASSPHRASE, { crypto, iterations });
    expect(envelope.ciphertextB64).not.toContain("exp_1");
    await expect(decryptBackup(envelope, PASSPHRASE, { crypto })).resolves.toEqual(payload);
  });

  it("fails closed on the wrong passphrase", async () => {
    const envelope = await encryptBackup({ a: 1 }, PASSPHRASE, { crypto, iterations });
    await expect(decryptBackup(envelope, "some other passphrase", { crypto })).rejects.toThrow(
      WrongPassphraseError,
    );
  });
});

describe("sha256Hex", () => {
  it("matches the known digest of the empty string", async () => {
    await expect(sha256Hex(new Uint8Array(0), crypto)).resolves.toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });
});
