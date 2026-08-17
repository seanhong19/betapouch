import { attachmentSchema, expenseSchema, openBytes, openJson, sealBytes, sealJson, settingsSchema, } from "@betapouch/core";
import Dexie, {} from "dexie";
class BetaPouchDb extends Dexie {
    meta;
    expenses;
    attachments;
    attachmentBlobs;
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
export async function loadVaultHeader() {
    const row = await db.meta.get(VAULT_HEADER_KEY);
    return row?.value ?? null;
}
export async function saveVaultHeader(header) {
    await db.meta.put({ key: VAULT_HEADER_KEY, value: header });
}
export async function vaultExists() {
    return (await loadVaultHeader()) !== null;
}
/* ---------------------------------------------------------------- expenses */
export async function putExpense(vault, expense) {
    const validated = expenseSchema.parse(expense);
    const sealed = await sealJson(vault, "expenses", validated.id, validated);
    await db.expenses.put({ id: validated.id, ...sealed, updatedAt: validated.updatedAt });
}
export async function putExpenses(vault, expenses) {
    const rows = [];
    for (const expense of expenses) {
        const validated = expenseSchema.parse(expense);
        const sealed = await sealJson(vault, "expenses", validated.id, validated);
        rows.push({ id: validated.id, ...sealed, updatedAt: validated.updatedAt });
    }
    await db.expenses.bulkPut(rows);
}
export async function loadExpenses(vault) {
    const rows = await db.expenses.toArray();
    const expenses = [];
    const damaged = [];
    for (const row of rows) {
        try {
            const decrypted = await openJson(vault, "expenses", row.id, {
                ivB64: row.ivB64,
                ciphertextB64: row.ciphertextB64,
            });
            expenses.push(expenseSchema.parse(decrypted));
        }
        catch {
            damaged.push(row.id);
        }
    }
    return { expenses, damaged };
}
export async function deleteExpense(id, attachmentIds = []) {
    await db.transaction("rw", db.expenses, db.attachments, db.attachmentBlobs, async () => {
        await db.expenses.delete(id);
        if (attachmentIds.length) {
            await db.attachments.bulkDelete(attachmentIds);
            await db.attachmentBlobs.bulkDelete(attachmentIds);
        }
    });
}
/* ------------------------------------------------------------- attachments */
export async function putAttachment(vault, attachment, bytes) {
    const validated = attachmentSchema.parse(attachment);
    const meta = await sealJson(vault, "attachments", validated.id, validated);
    const blob = await sealBytes(vault, "attachmentBlobs", validated.id, bytes);
    await db.transaction("rw", db.attachments, db.attachmentBlobs, async () => {
        await db.attachments.put({ id: validated.id, ...meta, updatedAt: validated.createdAt });
        await db.attachmentBlobs.put({ id: validated.id, ...blob, updatedAt: validated.createdAt });
    });
}
export async function loadAttachmentMeta(vault, id) {
    const row = await db.attachments.get(id);
    if (!row)
        return null;
    try {
        return attachmentSchema.parse(await openJson(vault, "attachments", id, sealedOf(row)));
    }
    catch {
        return null;
    }
}
export async function loadAttachmentBytes(vault, id) {
    const row = await db.attachmentBlobs.get(id);
    if (!row)
        return null;
    try {
        return await openBytes(vault, "attachmentBlobs", id, sealedOf(row));
    }
    catch {
        return null;
    }
}
function sealedOf(row) {
    return { ivB64: row.ivB64, ciphertextB64: row.ciphertextB64 };
}
/* ---------------------------------------------------------------- settings */
export async function loadSettings(vault) {
    const row = await db.meta.get(SETTINGS_ID);
    if (!row)
        return null;
    try {
        return settingsSchema.parse(await openJson(vault, "meta", SETTINGS_ID, row.value));
    }
    catch {
        return null;
    }
}
export async function saveSettings(vault, settings) {
    const validated = settingsSchema.parse(settings);
    const sealed = await sealJson(vault, "meta", SETTINGS_ID, validated);
    await db.meta.put({ key: SETTINGS_ID, value: sealed });
}
export async function loadSecrets(vault) {
    const row = await db.meta.get(SECRETS_ID);
    if (!row)
        return {};
    try {
        return await openJson(vault, "meta", SECRETS_ID, row.value);
    }
    catch {
        return {};
    }
}
export async function saveSecrets(vault, secrets) {
    const sealed = await sealJson(vault, "meta", SECRETS_ID, secrets);
    await db.meta.put({ key: SECRETS_ID, value: sealed });
}
/* --------------------------------------------------------- category memory */
export async function loadCategoryMemory(vault) {
    const row = await db.meta.get(CATEGORY_MEMORY_ID);
    if (!row)
        return {};
    try {
        return await openJson(vault, "meta", CATEGORY_MEMORY_ID, row.value);
    }
    catch {
        return {};
    }
}
export async function saveCategoryMemory(vault, memory) {
    const sealed = await sealJson(vault, "meta", CATEGORY_MEMORY_ID, memory);
    await db.meta.put({ key: CATEGORY_MEMORY_ID, value: sealed });
}
/* ------------------------------------------------------------------ danger */
/** Irreversible: drops the whole database, vault header included. */
export async function destroyEverything() {
    await db.delete();
}
/** Rough on-disk footprint, for the storage panel in Settings. */
export async function estimateUsage() {
    if (!navigator.storage?.estimate)
        return null;
    const estimate = await navigator.storage.estimate();
    return { usedBytes: estimate.usage ?? 0, quotaBytes: estimate.quota ?? 0 };
}
/**
 * Ask the browser to keep this origin's data out of automatic eviction.
 * Without it, a browser under storage pressure can quietly delete the only
 * copy of the user's ledger.
 */
export async function requestPersistentStorage() {
    if (!navigator.storage?.persist)
        return false;
    if (await navigator.storage.persisted?.())
        return true;
    return navigator.storage.persist();
}
