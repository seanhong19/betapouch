import {
  attachmentSchema,
  expenseSchema,
  openBytes,
  openJson,
  sealBytes,
  sealJson,
  settingsSchema,
  type Attachment,
  type CategoryMemory,
  type Expense,
  type SealedBlob,
  type Settings,
  type UnlockedVault,
  type VaultHeader,
} from "@betapouch/core";
import Dexie, { type Table } from "dexie";

/**
 * Local storage.
 *
 * Every row's payload is a sealed blob. Nothing readable is written to
 * IndexedDB — not the merchant, not the amount, not the date. That costs the
 * ability to query by index (we decrypt into memory on unlock instead), which
 * is the right trade for a personal-scale ledger: a few thousand records
 * decrypt in well under a second, and in exchange a stolen laptop yields
 * ciphertext rather than a spending profile.
 *
 * The vault header is stored in the clear on purpose — it holds a salt,
 * an iteration count, and a wrapped key, none of which are secret.
 */

interface SealedRow {
  id: string;
  ivB64: string;
  ciphertextB64: string;
  /** Kept in the clear so the list can be paged without decrypting all rows. */
  updatedAt: string;
}

interface MetaRow {
  key: string;
  value: unknown;
}

class BetaPouchDb extends Dexie {
  meta!: Table<MetaRow, string>;
  expenses!: Table<SealedRow, string>;
  attachments!: Table<SealedRow, string>;
  attachmentBlobs!: Table<SealedRow, string>;

  constructor() {
    super("betapouch");
    this.version(1).stores({
      meta: "key",
      expenses: "id, updatedAt",
      attachments: "id, updatedAt",
      attachmentBlobs: "id",
    });
  }
}

export const db = new BetaPouchDb();

const VAULT_HEADER_KEY = "vaultHeader";
const SETTINGS_ID = "settings";
const SECRETS_ID = "secrets";
const CATEGORY_MEMORY_ID = "categoryMemory";

export async function loadVaultHeader(): Promise<VaultHeader | null> {
  const row = await db.meta.get(VAULT_HEADER_KEY);
  return (row?.value as VaultHeader | undefined) ?? null;
}

export async function saveVaultHeader(header: VaultHeader): Promise<void> {
  await db.meta.put({ key: VAULT_HEADER_KEY, value: header });
}

export async function vaultExists(): Promise<boolean> {
  return (await loadVaultHeader()) !== null;
}

/* ---------------------------------------------------------------- expenses */

export async function putExpense(vault: UnlockedVault, expense: Expense): Promise<void> {
  const validated = expenseSchema.parse(expense);
  const sealed = await sealJson(vault, "expenses", validated.id, validated);
  await db.expenses.put({ id: validated.id, ...sealed, updatedAt: validated.updatedAt });
}

export async function putExpenses(vault: UnlockedVault, expenses: Expense[]): Promise<void> {
  const rows: SealedRow[] = [];
  for (const expense of expenses) {
    const validated = expenseSchema.parse(expense);
    const sealed = await sealJson(vault, "expenses", validated.id, validated);
    rows.push({ id: validated.id, ...sealed, updatedAt: validated.updatedAt });
  }
  await db.expenses.bulkPut(rows);
}

export interface LoadResult {
  expenses: Expense[];
  /** Rows that would not decrypt or validate, so the UI can warn instead of
   *  silently showing an incomplete ledger. */
  damaged: string[];
}

export async function loadExpenses(vault: UnlockedVault): Promise<LoadResult> {
  const rows = await db.expenses.toArray();
  const expenses: Expense[] = [];
  const damaged: string[] = [];
  for (const row of rows) {
    try {
      const decrypted = await openJson<unknown>(vault, "expenses", row.id, {
        ivB64: row.ivB64,
        ciphertextB64: row.ciphertextB64,
      });
      expenses.push(expenseSchema.parse(decrypted));
    } catch {
      damaged.push(row.id);
    }
  }
  return { expenses, damaged };
}

export async function deleteExpense(id: string, attachmentIds: string[] = []): Promise<void> {
  await db.transaction("rw", db.expenses, db.attachments, db.attachmentBlobs, async () => {
    await db.expenses.delete(id);
    if (attachmentIds.length) {
      await db.attachments.bulkDelete(attachmentIds);
      await db.attachmentBlobs.bulkDelete(attachmentIds);
    }
  });
}

/* ------------------------------------------------------------- attachments */

export async function putAttachment(
  vault: UnlockedVault,
  attachment: Attachment,
  bytes: Uint8Array,
): Promise<void> {
  const validated = attachmentSchema.parse(attachment);
  const meta = await sealJson(vault, "attachments", validated.id, validated);
  const blob = await sealBytes(vault, "attachmentBlobs", validated.id, bytes);
  await db.transaction("rw", db.attachments, db.attachmentBlobs, async () => {
    await db.attachments.put({ id: validated.id, ...meta, updatedAt: validated.createdAt });
    await db.attachmentBlobs.put({ id: validated.id, ...blob, updatedAt: validated.createdAt });
  });
}

export async function loadAttachmentMeta(
  vault: UnlockedVault,
  id: string,
): Promise<Attachment | null> {
  const row = await db.attachments.get(id);
  if (!row) return null;
  try {
    return attachmentSchema.parse(
      await openJson<unknown>(vault, "attachments", id, sealedOf(row)),
    );
  } catch {
    return null;
  }
}

export async function loadAttachmentBytes(
  vault: UnlockedVault,
  id: string,
): Promise<Uint8Array | null> {
  const row = await db.attachmentBlobs.get(id);
  if (!row) return null;
  try {
    return await openBytes(vault, "attachmentBlobs", id, sealedOf(row));
  } catch {
    return null;
  }
}

function sealedOf(row: SealedRow): SealedBlob {
  return { ivB64: row.ivB64, ciphertextB64: row.ciphertextB64 };
}

/* ---------------------------------------------------------------- settings */

export async function loadSettings(vault: UnlockedVault): Promise<Settings | null> {
  const row = await db.meta.get(SETTINGS_ID);
  if (!row) return null;
  try {
    return settingsSchema.parse(
      await openJson<unknown>(vault, "meta", SETTINGS_ID, row.value as SealedBlob),
    );
  } catch {
    return null;
  }
}

export async function saveSettings(vault: UnlockedVault, settings: Settings): Promise<void> {
  const validated = settingsSchema.parse(settings);
  const sealed = await sealJson(vault, "meta", SETTINGS_ID, validated);
  await db.meta.put({ key: SETTINGS_ID, value: sealed });
}

/* ----------------------------------------------------------------- secrets */

/**
 * API keys and bridge tokens, sealed under the same DEK. They live here and
 * nowhere else — never localStorage, never sessionStorage, never a cookie,
 * all of which are readable by any script that manages to run on the origin.
 */
export type SecretStore = Record<string, { apiKey?: string; bridgeToken?: string }>;

export async function loadSecrets(vault: UnlockedVault): Promise<SecretStore> {
  const row = await db.meta.get(SECRETS_ID);
  if (!row) return {};
  try {
    return await openJson<SecretStore>(vault, "meta", SECRETS_ID, row.value as SealedBlob);
  } catch {
    return {};
  }
}

export async function saveSecrets(vault: UnlockedVault, secrets: SecretStore): Promise<void> {
  const sealed = await sealJson(vault, "meta", SECRETS_ID, secrets);
  await db.meta.put({ key: SECRETS_ID, value: sealed });
}

/* --------------------------------------------------------- category memory */

export async function loadCategoryMemory(vault: UnlockedVault): Promise<CategoryMemory> {
  const row = await db.meta.get(CATEGORY_MEMORY_ID);
  if (!row) return {};
  try {
    return await openJson<CategoryMemory>(vault, "meta", CATEGORY_MEMORY_ID, row.value as SealedBlob);
  } catch {
    return {};
  }
}

export async function saveCategoryMemory(
  vault: UnlockedVault,
  memory: CategoryMemory,
): Promise<void> {
  const sealed = await sealJson(vault, "meta", CATEGORY_MEMORY_ID, memory);
  await db.meta.put({ key: CATEGORY_MEMORY_ID, value: sealed });
}

/* ------------------------------------------------------------------ danger */

/** Irreversible: drops the whole database, vault header included. */
export async function destroyEverything(): Promise<void> {
  await db.delete();
}

/** Rough on-disk footprint, for the storage panel in Settings. */
export async function estimateUsage(): Promise<{ usedBytes: number; quotaBytes: number } | null> {
  if (!navigator.storage?.estimate) return null;
  const estimate = await navigator.storage.estimate();
  return { usedBytes: estimate.usage ?? 0, quotaBytes: estimate.quota ?? 0 };
}

/**
 * Ask the browser to keep this origin's data out of automatic eviction.
 * Without it, a browser under storage pressure can quietly delete the only
 * copy of the user's ledger.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  if (await navigator.storage.persisted?.()) return true;
  return navigator.storage.persist();
}
