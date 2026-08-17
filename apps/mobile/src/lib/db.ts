import {
  expenseSchema,
  openBytes,
  openJson,
  sealBytes,
  sealJson,
  settingsSchema,
  type Attachment,
  type Expense,
  type SealedBlob,
  type Settings,
  type UnlockedVault,
  type VaultHeader,
} from "@betapouch/core";
import * as SQLite from "expo-sqlite";

/**
 * Local storage on device: SQLite holding sealed blobs.
 *
 * Same rule as the web app — no column holds anything readable. The database
 * file is inside the app's sandbox, but a sandbox is not a boundary you want
 * to be the only one: a rooted phone, a full-device backup, or a forensic
 * extraction all read it straight out.
 */

let database: SQLite.SQLiteDatabase | null = null;

async function open(): Promise<SQLite.SQLiteDatabase> {
  if (database) return database;
  database = await SQLite.openDatabaseAsync("betapouch.db");
  await database.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY NOT NULL,
      iv TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY NOT NULL,
      iv TEXT NOT NULL,
      ciphertext TEXT NOT NULL,
      meta_iv TEXT NOT NULL,
      meta_ciphertext TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS expenses_updated_at ON expenses (updated_at);
  `);
  return database;
}

const VAULT_HEADER_KEY = "vaultHeader";
const SETTINGS_KEY = "settings";
const SECRETS_KEY = "secrets";

/* ------------------------------------------------------------------- meta */

async function getMeta(key: string): Promise<string | null> {
  const db = await open();
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM meta WHERE key = ?", key);
  return row?.value ?? null;
}

async function setMeta(key: string, value: string): Promise<void> {
  const db = await open();
  await db.runAsync(
    "INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    value,
  );
}

export async function loadVaultHeader(): Promise<VaultHeader | null> {
  const raw = await getMeta(VAULT_HEADER_KEY);
  return raw ? (JSON.parse(raw) as VaultHeader) : null;
}

export async function saveVaultHeader(header: VaultHeader): Promise<void> {
  await setMeta(VAULT_HEADER_KEY, JSON.stringify(header));
}

/* --------------------------------------------------------------- expenses */

export async function putExpense(vault: UnlockedVault, expense: Expense): Promise<void> {
  const validated = expenseSchema.parse(expense);
  const sealed = await sealJson(vault, "expenses", validated.id, validated);
  const db = await open();
  await db.runAsync(
    `INSERT INTO expenses (id, iv, ciphertext, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET iv = excluded.iv, ciphertext = excluded.ciphertext, updated_at = excluded.updated_at`,
    validated.id,
    sealed.ivB64,
    sealed.ciphertextB64,
    validated.updatedAt,
  );
}

export interface LoadResult {
  expenses: Expense[];
  damaged: string[];
}

export async function loadExpenses(vault: UnlockedVault): Promise<LoadResult> {
  const db = await open();
  const rows = await db.getAllAsync<{ id: string; iv: string; ciphertext: string }>(
    "SELECT id, iv, ciphertext FROM expenses ORDER BY updated_at DESC",
  );

  const expenses: Expense[] = [];
  const damaged: string[] = [];
  for (const row of rows) {
    try {
      const decrypted = await openJson<unknown>(vault, "expenses", row.id, {
        ivB64: row.iv,
        ciphertextB64: row.ciphertext,
      });
      expenses.push(expenseSchema.parse(decrypted));
    } catch {
      damaged.push(row.id);
    }
  }
  return { expenses, damaged };
}

export async function deleteExpense(id: string, attachmentIds: string[] = []): Promise<void> {
  const db = await open();
  await db.withTransactionAsync(async () => {
    await db.runAsync("DELETE FROM expenses WHERE id = ?", id);
    for (const attachmentId of attachmentIds) {
      await db.runAsync("DELETE FROM attachments WHERE id = ?", attachmentId);
    }
  });
}

/* ------------------------------------------------------------ attachments */

export async function putAttachment(
  vault: UnlockedVault,
  attachment: Attachment,
  bytes: Uint8Array,
): Promise<void> {
  const meta = await sealJson(vault, "attachments", attachment.id, attachment);
  const blob = await sealBytes(vault, "attachmentBlobs", attachment.id, bytes);
  const db = await open();
  await db.runAsync(
    `INSERT INTO attachments (id, iv, ciphertext, meta_iv, meta_ciphertext, created_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET iv = excluded.iv, ciphertext = excluded.ciphertext`,
    attachment.id,
    blob.ivB64,
    blob.ciphertextB64,
    meta.ivB64,
    meta.ciphertextB64,
    attachment.createdAt,
  );
}

export async function loadAttachmentBytes(
  vault: UnlockedVault,
  id: string,
): Promise<Uint8Array | null> {
  const db = await open();
  const row = await db.getFirstAsync<{ iv: string; ciphertext: string }>(
    "SELECT iv, ciphertext FROM attachments WHERE id = ?",
    id,
  );
  if (!row) return null;
  try {
    return await openBytes(vault, "attachmentBlobs", id, {
      ivB64: row.iv,
      ciphertextB64: row.ciphertext,
    });
  } catch {
    return null;
  }
}

/* --------------------------------------------------------- settings/keys */

export async function loadSettings(vault: UnlockedVault): Promise<Settings | null> {
  const raw = await getMeta(SETTINGS_KEY);
  if (!raw) return null;
  try {
    return settingsSchema.parse(
      await openJson<unknown>(vault, "meta", SETTINGS_KEY, JSON.parse(raw) as SealedBlob),
    );
  } catch {
    return null;
  }
}

export async function saveSettings(vault: UnlockedVault, settings: Settings): Promise<void> {
  const sealed = await sealJson(vault, "meta", SETTINGS_KEY, settingsSchema.parse(settings));
  await setMeta(SETTINGS_KEY, JSON.stringify(sealed));
}

export type SecretStore = Record<string, { apiKey?: string; bridgeToken?: string }>;

export async function loadSecrets(vault: UnlockedVault): Promise<SecretStore> {
  const raw = await getMeta(SECRETS_KEY);
  if (!raw) return {};
  try {
    return await openJson<SecretStore>(vault, "meta", SECRETS_KEY, JSON.parse(raw) as SealedBlob);
  } catch {
    return {};
  }
}

export async function saveSecrets(vault: UnlockedVault, secrets: SecretStore): Promise<void> {
  const sealed = await sealJson(vault, "meta", SECRETS_KEY, secrets);
  await setMeta(SECRETS_KEY, JSON.stringify(sealed));
}

/** Irreversible: drops every table and the vault header with them. */
export async function destroyEverything(): Promise<void> {
  const db = await open();
  await db.execAsync("DELETE FROM expenses; DELETE FROM attachments; DELETE FROM meta;");
}
