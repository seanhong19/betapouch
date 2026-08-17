import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { AI_PROVIDER_KINDS, assessPassphrase, backupEnvelopeSchema, backupPayloadSchema, decryptBackup, encryptBackup, importExpensesJson, newId, safeFilename, } from "@betapouch/core";
import { useEffect, useRef, useState } from "react";
import { destroyEverything, estimateUsage, loadSecrets, saveSecrets } from "../lib/db";
import { useExpenses } from "../lib/expenses";
import { useVault } from "../lib/vault";
const KIND_LABELS = {
    none: "None",
    anthropic: "Anthropic (your API key)",
    "openai-compatible": "OpenAI-compatible (OpenAI, OpenRouter, LM Studio…)",
    ollama: "Ollama (local model on this machine)",
    "agent-bridge": "Agent bridge (Claude Code / Codex on this machine)",
};
const KIND_DEFAULTS = {
    none: { baseUrl: "", model: "" },
    anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-5" },
    "openai-compatible": { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
    ollama: { baseUrl: "http://localhost:11434", model: "llama3.2-vision" },
    "agent-bridge": { baseUrl: "http://127.0.0.1:4747", model: "claude" },
};
export function SettingsScreen() {
    const { settings, updateSettings, vault, changeVaultPassphrase, lock } = useVault();
    const { expenses, importExpenses } = useExpenses();
    const [usage, setUsage] = useState(null);
    const [message, setMessage] = useState(null);
    useEffect(() => {
        void estimateUsage().then(setUsage);
    }, [expenses.length]);
    return (_jsxs("div", { className: "flex flex-col gap-5", children: [_jsx("h1", { className: "m-0 text-xl font-semibold tracking-tight", children: "Settings" }), message && (_jsx("p", { role: "status", className: "card m-0 p-3 text-sm", style: { color: "var(--text-secondary)" }, children: message })), _jsxs(Section, { title: "General", children: [_jsx(Row, { label: "Base currency", hint: "Used for the dashboard headline and new expenses.", children: _jsx("input", { className: "field w-28 uppercase", value: settings.baseCurrency, maxLength: 3, onChange: (event) => void updateSettings({ baseCurrency: event.target.value.toUpperCase().slice(0, 3) }) }) }), _jsx(Row, { label: "Language & formatting", children: _jsx("input", { className: "field w-40", value: settings.locale, onChange: (event) => void updateSettings({ locale: event.target.value }) }) }), _jsx(Row, { label: "Theme", children: _jsxs("select", { className: "field w-32", value: settings.theme, onChange: (event) => void updateSettings({ theme: event.target.value }), children: [_jsx("option", { value: "system", children: "System" }), _jsx("option", { value: "light", children: "Light" }), _jsx("option", { value: "dark", children: "Dark" })] }) })] }), _jsxs(Section, { title: "Privacy & security", children: [_jsx(Row, { label: "Auto-lock", hint: "Locks the vault after this long without activity. 0 turns it off.", children: _jsxs("div", { className: "flex items-center gap-2", children: [_jsx("input", { className: "field tabular w-20", type: "number", min: 0, max: 1440, value: settings.autoLockMinutes, onChange: (event) => void updateSettings({ autoLockMinutes: Math.max(0, Number(event.target.value) || 0) }) }), _jsx("span", { className: "text-xs", style: { color: "var(--text-muted)" }, children: "minutes" })] }) }), _jsx(Toggle, { label: "Lock when the app is hidden", hint: "Locks the moment you switch tabs or background the app.", checked: settings.lockOnHide, onChange: (value) => void updateSettings({ lockOnHide: value }) }), _jsx(Toggle, { label: "Strip location data from images", hint: "Removes EXIF \u2014 including the GPS tag that records where a photo was taken.", checked: settings.stripImageMetadata, onChange: (value) => void updateSettings({ stripImageMetadata: value }) }), _jsx(Toggle, { label: "Read receipts on this device", hint: "Offline OCR. No image or text leaves the device for this.", checked: settings.ocrEnabled, onChange: (value) => void updateSettings({ ocrEnabled: value }) }), _jsx("div", { className: "pt-2", children: _jsx(PassphraseChanger, { onChange: changeVaultPassphrase, onDone: () => setMessage("Passphrase changed. Your records did not need re-encrypting.") }) })] }), _jsx(AiProvidersSection, { onMessage: setMessage }), _jsxs(Section, { title: "Your data", children: [_jsxs("p", { className: "m-0 text-sm", style: { color: "var(--text-secondary)" }, children: [expenses.length, " ", expenses.length === 1 ? "record" : "records", " stored on this device", usage && ` · about ${(usage.usedBytes / 1024 / 1024).toFixed(1)} MB used`, "."] }), _jsx(BackupPanel, { onMessage: setMessage }), _jsx(ImportPanel, { onImport: importExpenses, onMessage: setMessage }), _jsx(DangerZone, { onDestroyed: lock })] }), _jsxs(Section, { title: "About", children: [_jsx("p", { className: "m-0 text-sm", style: { color: "var(--text-secondary)" }, children: "BetaPouch keeps everything on this device, encrypted with your passphrase. There is no account, no server, and no analytics. The only network requests it ever makes are the ones you configure above." }), _jsxs("p", { className: "m-0 text-xs", style: { color: "var(--text-muted)" }, children: ["Vault: AES-256-GCM, key derived with PBKDF2-SHA256 (", vault?.header.kdf.iterations.toLocaleString(), " ", "iterations)."] })] })] }));
}
/* ------------------------------------------------------------- AI section */
function AiProvidersSection({ onMessage }) {
    const { settings, updateSettings, vault } = useVault();
    const [draft, setDraft] = useState(null);
    const [apiKey, setApiKey] = useState("");
    async function save() {
        if (!draft || !vault)
            return;
        const providers = settings.aiProviders.some((p) => p.id === draft.id)
            ? settings.aiProviders.map((p) => (p.id === draft.id ? { ...draft, hasApiKey: Boolean(apiKey) || p.hasApiKey } : p))
            : [...settings.aiProviders, { ...draft, hasApiKey: Boolean(apiKey) }];
        if (apiKey.trim()) {
            // Secrets go to the encrypted store, never into settings.
            const secrets = await loadSecrets(vault);
            const field = draft.kind === "agent-bridge" ? "bridgeToken" : "apiKey";
            secrets[draft.id] = { ...secrets[draft.id], [field]: apiKey.trim() };
            await saveSecrets(vault, secrets);
        }
        await updateSettings({ aiProviders: providers, activeAiProviderId: draft.id });
        setDraft(null);
        setApiKey("");
        onMessage("Provider saved. The key is stored in your encrypted vault.");
    }
    async function remove(id) {
        if (!vault)
            return;
        const secrets = await loadSecrets(vault);
        delete secrets[id];
        await saveSecrets(vault, secrets);
        await updateSettings({
            aiProviders: settings.aiProviders.filter((p) => p.id !== id),
            activeAiProviderId: settings.activeAiProviderId === id ? null : settings.activeAiProviderId,
        });
        onMessage("Provider removed and its key deleted.");
    }
    return (_jsxs(Section, { title: "AI (optional)", children: [_jsx("p", { className: "m-0 text-sm", style: { color: "var(--text-secondary)" }, children: "Everything works without this. Add a provider only if you want help reading receipts or answering questions about your spending." }), settings.aiProviders.length > 0 && (_jsx("ul", { className: "m-0 flex list-none flex-col gap-2 p-0", children: settings.aiProviders.map((provider) => (_jsxs("li", { className: "flex items-center justify-between gap-3 rounded-lg p-3", style: { background: "var(--plane)" }, children: [_jsxs("label", { className: "flex flex-1 cursor-pointer items-center gap-3", children: [_jsx("input", { type: "radio", name: "activeProvider", checked: settings.activeAiProviderId === provider.id, onChange: () => void updateSettings({ activeAiProviderId: provider.id }) }), _jsxs("span", { className: "min-w-0", children: [_jsx("span", { className: "block truncate text-sm font-medium", children: provider.label || KIND_LABELS[provider.kind] }), _jsxs("span", { className: "block truncate text-xs", style: { color: "var(--text-muted)" }, children: [provider.model, provider.baseUrl ? ` · ${new URL(provider.baseUrl).host}` : "", provider.redactBeforeSend ? " · redacts PII" : " · redaction off"] })] })] }), _jsxs("span", { className: "flex shrink-0 gap-1", children: [_jsx("button", { type: "button", className: "btn px-2 py-1 text-xs", onClick: () => setDraft(provider), children: "Edit" }), _jsx("button", { type: "button", className: "btn btn-danger px-2 py-1 text-xs", onClick: () => void remove(provider.id), children: "Remove" })] })] }, provider.id))) })), draft ? (_jsxs("div", { className: "flex flex-col gap-3 rounded-lg p-3", style: { background: "var(--plane)" }, children: [_jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "providerKind", children: "Provider" }), _jsx("select", { id: "providerKind", className: "field", value: draft.kind, onChange: (event) => {
                                    const kind = event.target.value;
                                    setDraft({ ...draft, kind, ...KIND_DEFAULTS[kind] });
                                }, children: AI_PROVIDER_KINDS.filter((kind) => kind !== "none").map((kind) => (_jsx("option", { value: kind, children: KIND_LABELS[kind] }, kind))) })] }), _jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "providerLabel", children: "Name" }), _jsx("input", { id: "providerLabel", className: "field", value: draft.label, placeholder: "My Anthropic key", onChange: (event) => setDraft({ ...draft, label: event.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "providerUrl", children: "Endpoint" }), _jsx("input", { id: "providerUrl", className: "field", value: draft.baseUrl ?? "", onChange: (event) => setDraft({ ...draft, baseUrl: event.target.value }) })] }), _jsxs("div", { children: [_jsx("label", { className: "label", htmlFor: "providerModel", children: "Model" }), _jsx("input", { id: "providerModel", className: "field", value: draft.model, onChange: (event) => setDraft({ ...draft, model: event.target.value }) })] }), _jsxs("div", { children: [_jsxs("label", { className: "label", htmlFor: "providerKey", children: [draft.kind === "agent-bridge" ? "Bridge token" : "API key", draft.kind === "ollama" && " (not needed for Ollama)"] }), _jsx("input", { id: "providerKey", className: "field", type: "password", autoComplete: "off", value: apiKey, placeholder: draft.hasApiKey ? "•••••••• (leave blank to keep)" : "", onChange: (event) => setApiKey(event.target.value) }), _jsx("p", { className: "mt-1 text-xs", style: { color: "var(--text-muted)" }, children: "Stored encrypted in your vault. Never written to browser storage in the clear." })] }), _jsx(Toggle, { label: "Redact personal details before sending", hint: "Strips card numbers, emails, phone numbers and URLs from receipt text.", checked: draft.redactBeforeSend, onChange: (value) => setDraft({ ...draft, redactBeforeSend: value }) }), _jsx(Toggle, { label: "Allow sending the receipt image", hint: "Needed for vision models. An image cannot be redacted \u2014 it goes as photographed.", checked: draft.allowImageUpload, onChange: (value) => setDraft({ ...draft, allowImageUpload: value }) }), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "btn btn-primary flex-1", onClick: () => void save(), children: "Save provider" }), _jsx("button", { type: "button", className: "btn", onClick: () => setDraft(null), children: "Cancel" })] })] })) : (_jsx("button", { type: "button", className: "btn", onClick: () => {
                    setApiKey("");
                    setDraft({
                        id: newId("ai"),
                        kind: "anthropic",
                        label: "",
                        ...KIND_DEFAULTS.anthropic,
                        hasApiKey: false,
                        redactBeforeSend: true,
                        allowImageUpload: false,
                    });
                }, children: "Add a provider" }))] }));
}
/* ------------------------------------------------------------ data panels */
function BackupPanel({ onMessage }) {
    const { expenses } = useExpenses();
    const { settings } = useVault();
    const [passphrase, setPassphrase] = useState("");
    const [busy, setBusy] = useState(false);
    const strength = assessPassphrase(passphrase);
    async function exportBackup() {
        setBusy(true);
        try {
            const envelope = await encryptBackup({ expenses, settings, attachments: [] }, passphrase);
            const file = backupEnvelopeSchema.parse({
                format: "betapouch-backup",
                version: 1,
                createdAt: new Date().toISOString(),
                cipher: "AES-GCM",
                ...envelope,
            });
            const url = URL.createObjectURL(new Blob([JSON.stringify(file)], { type: "application/json" }));
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = safeFilename(`betapouch-backup-${new Date().toISOString().slice(0, 10)}`, "json");
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 5_000);
            setPassphrase("");
            onMessage("Encrypted backup saved. It can only be opened with that passphrase.");
        }
        catch (error) {
            onMessage(error instanceof Error ? error.message : "The backup could not be created.");
        }
        finally {
            setBusy(false);
        }
    }
    return (_jsxs("div", { className: "rounded-lg p-3", style: { background: "var(--plane)" }, children: [_jsx("h3", { className: "m-0 text-sm font-semibold", children: "Encrypted backup" }), _jsx("p", { className: "mb-3 mt-1 text-xs", style: { color: "var(--text-muted)" }, children: "Exports every record into one encrypted file. Safe to keep in cloud storage \u2014 without the passphrase it is noise. Receipt images are not included." }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("input", { className: "field flex-1 basis-48", type: "password", autoComplete: "new-password", placeholder: "Passphrase for this backup", value: passphrase, onChange: (event) => setPassphrase(event.target.value) }), _jsx("button", { type: "button", className: "btn", onClick: () => void exportBackup(), disabled: busy || !strength.ok || expenses.length === 0, children: "Export" })] }), passphrase.length > 0 && !strength.ok && (_jsx("p", { className: "mb-0 mt-2 text-xs", style: { color: "var(--status-serious)" }, children: strength.problems[0] }))] }));
}
function ImportPanel({ onImport, onMessage, }) {
    const inputRef = useRef(null);
    const [passphrase, setPassphrase] = useState("");
    async function handleFile(file) {
        try {
            if (file.size > 100 * 1024 * 1024)
                throw new Error("That file is too large to import.");
            const text = await file.text();
            // An encrypted backup and a plain export are both accepted; the shape
            // decides which, and both are validated before anything is stored.
            const asEnvelope = backupEnvelopeSchema.safeParse(JSON.parse(text));
            if (asEnvelope.success) {
                if (!passphrase) {
                    onMessage("That is an encrypted backup — enter its passphrase first.");
                    return;
                }
                const payload = backupPayloadSchema.parse(await decryptBackup(asEnvelope.data, passphrase));
                const count = await onImport(payload.expenses);
                onMessage(`Restored ${count} ${count === 1 ? "record" : "records"} from the backup.`);
                setPassphrase("");
                return;
            }
            const result = importExpensesJson(text);
            const count = await onImport(result.expenses);
            onMessage(result.skipped.length
                ? `Imported ${count}; skipped ${result.skipped.length} record(s) that did not validate.`
                : `Imported ${count} ${count === 1 ? "record" : "records"}.`);
        }
        catch (error) {
            onMessage(error instanceof Error ? error.message : "That file could not be imported.");
        }
    }
    return (_jsxs("div", { className: "rounded-lg p-3", style: { background: "var(--plane)" }, children: [_jsx("h3", { className: "m-0 text-sm font-semibold", children: "Restore or import" }), _jsx("p", { className: "mb-3 mt-1 text-xs", style: { color: "var(--text-muted)" }, children: "Accepts a BetaPouch backup or a plain JSON export. Imported records get new ids, so nothing already here is overwritten." }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("input", { className: "field flex-1 basis-48", type: "password", autoComplete: "off", placeholder: "Backup passphrase (if encrypted)", value: passphrase, onChange: (event) => setPassphrase(event.target.value) }), _jsx("input", { ref: inputRef, type: "file", accept: "application/json,.json", className: "hidden", onChange: (event) => {
                            const file = event.target.files?.[0];
                            if (file)
                                void handleFile(file);
                            event.target.value = "";
                        } }), _jsx("button", { type: "button", className: "btn", onClick: () => inputRef.current?.click(), children: "Choose file" })] })] }));
}
function DangerZone({ onDestroyed }) {
    const [confirmation, setConfirmation] = useState("");
    const armed = confirmation === "DELETE EVERYTHING";
    return (_jsxs("div", { className: "rounded-lg p-3", style: { background: "var(--plane)", border: "1px solid var(--status-critical)" }, children: [_jsx("h3", { className: "m-0 text-sm font-semibold", style: { color: "var(--status-critical)" }, children: "Delete everything" }), _jsx("p", { className: "mb-3 mt-1 text-xs", style: { color: "var(--text-muted)" }, children: "Erases the vault and every record on this device. There is no copy anywhere else and this cannot be undone. Export a backup first if you might want the data back." }), _jsxs("div", { className: "flex flex-wrap gap-2", children: [_jsx("input", { className: "field flex-1 basis-48", placeholder: "Type DELETE EVERYTHING", value: confirmation, onChange: (event) => setConfirmation(event.target.value) }), _jsx("button", { type: "button", className: "btn btn-danger", disabled: !armed, onClick: () => {
                            void destroyEverything().then(() => {
                                onDestroyed();
                                location.reload();
                            });
                        }, children: "Delete" })] })] }));
}
function PassphraseChanger({ onChange, onDone, }) {
    const [open, setOpen] = useState(false);
    const [current, setCurrent] = useState("");
    const [next, setNext] = useState("");
    const [error, setError] = useState(null);
    const strength = assessPassphrase(next);
    if (!open) {
        return (_jsx("button", { type: "button", className: "btn", onClick: () => setOpen(true), children: "Change passphrase" }));
    }
    return (_jsxs("div", { className: "flex flex-col gap-2 rounded-lg p-3", style: { background: "var(--plane)" }, children: [_jsx("input", { className: "field", type: "password", autoComplete: "current-password", placeholder: "Current passphrase", value: current, onChange: (event) => setCurrent(event.target.value) }), _jsx("input", { className: "field", type: "password", autoComplete: "new-password", placeholder: "New passphrase", value: next, onChange: (event) => setNext(event.target.value) }), next && !strength.ok && (_jsx("p", { className: "m-0 text-xs", style: { color: "var(--status-serious)" }, children: strength.problems[0] })), error && (_jsx("p", { className: "m-0 text-xs", style: { color: "var(--status-critical)" }, children: error })), _jsxs("div", { className: "flex gap-2", children: [_jsx("button", { type: "button", className: "btn btn-primary flex-1", disabled: !current || !strength.ok, onClick: () => {
                            setError(null);
                            void onChange(current, next)
                                .then(() => {
                                setOpen(false);
                                setCurrent("");
                                setNext("");
                                onDone();
                            })
                                .catch((caught) => setError(caught instanceof Error ? caught.message : "That did not work."));
                        }, children: "Change it" }), _jsx("button", { type: "button", className: "btn", onClick: () => setOpen(false), children: "Cancel" })] })] }));
}
/* ------------------------------------------------------------- primitives */
function Section({ title, children }) {
    return (_jsxs("section", { className: "card flex flex-col gap-3 p-5", children: [_jsx("h2", { className: "m-0 text-sm font-semibold", children: title }), children] }));
}
function Row({ label, hint, children, }) {
    return (_jsxs("div", { className: "flex flex-wrap items-center justify-between gap-3", children: [_jsxs("div", { className: "min-w-0 flex-1", children: [_jsx("div", { className: "text-sm", children: label }), hint && (_jsx("div", { className: "text-xs", style: { color: "var(--text-muted)" }, children: hint }))] }), children] }));
}
function Toggle({ label, hint, checked, onChange, }) {
    return (_jsxs("label", { className: "flex cursor-pointer items-start justify-between gap-3", children: [_jsxs("span", { className: "min-w-0 flex-1", children: [_jsx("span", { className: "block text-sm", children: label }), hint && (_jsx("span", { className: "block text-xs", style: { color: "var(--text-muted)" }, children: hint }))] }), _jsx("input", { type: "checkbox", className: "mt-1 h-5 w-5 shrink-0", checked: checked, onChange: (event) => onChange(event.target.checked) })] }));
}
