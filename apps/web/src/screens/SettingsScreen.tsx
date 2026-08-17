import {
  AI_PROVIDER_KINDS,
  assessPassphrase,
  backupEnvelopeSchema,
  backupPayloadSchema,
  decryptBackup,
  encryptBackup,
  importExpensesJson,
  newId,
  safeFilename,
  type AiProviderConfig,
  type AiProviderKind,
} from "@betapouch/core";
import { useEffect, useRef, useState } from "react";
import { CurrencyPicker } from "../components/CurrencyPicker";
import { destroyEverything, estimateUsage, loadSecrets, saveSecrets } from "../lib/db";
import { useExpenses } from "../lib/expenses";
import { useVault } from "../lib/vault";

const KIND_LABELS: Record<AiProviderKind, string> = {
  none: "None",
  anthropic: "Anthropic (your API key)",
  "openai-compatible": "OpenAI-compatible (OpenAI, OpenRouter, LM Studio…)",
  ollama: "Ollama (local model on this machine)",
  "agent-bridge": "Agent bridge (Claude Code / Codex on this machine)",
};

const KIND_DEFAULTS: Record<AiProviderKind, { baseUrl: string; model: string }> = {
  none: { baseUrl: "", model: "" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-5" },
  "openai-compatible": { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  ollama: { baseUrl: "http://localhost:11434", model: "llama3.2-vision" },
  "agent-bridge": { baseUrl: "http://127.0.0.1:4747", model: "claude" },
};

export function SettingsScreen() {
  const { settings, updateSettings, vault, changeVaultPassphrase, lock } = useVault();
  const { expenses, importExpenses } = useExpenses();
  const [usage, setUsage] = useState<{ usedBytes: number; quotaBytes: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    void estimateUsage().then(setUsage);
  }, [expenses.length]);

  return (
    <div className="flex flex-col gap-5">
      <h1 className="m-0 text-xl font-semibold tracking-tight">Settings</h1>

      {message && (
        <p role="status" className="card m-0 p-3 text-sm" style={{ color: "var(--text-secondary)" }}>
          {message}
        </p>
      )}

      <Section title="General">
        <Row label="Base currency" hint="Used for the dashboard headline and new expenses.">
          <div className="w-64">
            <CurrencyPicker
              value={settings.baseCurrency}
              locale={settings.locale}
              onChange={(code) => void updateSettings({ baseCurrency: code })}
            />
          </div>
        </Row>
        <Row label="Language & formatting">
          <input
            className="field w-40"
            value={settings.locale}
            onChange={(event) => void updateSettings({ locale: event.target.value })}
          />
        </Row>
        <Row label="Theme">
          <select
            className="field w-32"
            value={settings.theme}
            onChange={(event) =>
              void updateSettings({ theme: event.target.value as typeof settings.theme })
            }
          >
            <option value="system">System</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </Row>
      </Section>

      <Section title="Privacy & security">
        <Row
          label="Auto-lock"
          hint="Locks the vault after this long without activity. 0 turns it off."
        >
          <div className="flex items-center gap-2">
            <input
              className="field tabular w-20"
              type="number"
              min={0}
              max={1440}
              value={settings.autoLockMinutes}
              onChange={(event) =>
                void updateSettings({ autoLockMinutes: Math.max(0, Number(event.target.value) || 0) })
              }
            />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              minutes
            </span>
          </div>
        </Row>
        <Toggle
          label="Lock when the app is hidden"
          hint="Locks the moment you switch tabs or background the app."
          checked={settings.lockOnHide}
          onChange={(value) => void updateSettings({ lockOnHide: value })}
        />
        <Toggle
          label="Strip location data from images"
          hint="Removes EXIF — including the GPS tag that records where a photo was taken."
          checked={settings.stripImageMetadata}
          onChange={(value) => void updateSettings({ stripImageMetadata: value })}
        />
        <Toggle
          label="Read receipts on this device"
          hint="Offline OCR. No image or text leaves the device for this."
          checked={settings.ocrEnabled}
          onChange={(value) => void updateSettings({ ocrEnabled: value })}
        />
        <div className="pt-2">
          <PassphraseChanger
            onChange={changeVaultPassphrase}
            onDone={() => setMessage("Passphrase changed. Your records did not need re-encrypting.")}
          />
        </div>
      </Section>

      <AiProvidersSection onMessage={setMessage} />

      <Section title="Your data">
        <p className="m-0 text-sm" style={{ color: "var(--text-secondary)" }}>
          {expenses.length} {expenses.length === 1 ? "record" : "records"} stored on this device
          {usage && ` · about ${(usage.usedBytes / 1024 / 1024).toFixed(1)} MB used`}.
        </p>
        <BackupPanel onMessage={setMessage} />
        <ImportPanel onImport={importExpenses} onMessage={setMessage} />
        <DangerZone onDestroyed={lock} />
      </Section>

      <Section title="About">
        <p className="m-0 text-sm" style={{ color: "var(--text-secondary)" }}>
          BetaPouch keeps everything on this device, encrypted with your passphrase. There is no
          account, no server, and no analytics. The only network requests it ever makes are the ones
          you configure above.
        </p>
        <p className="m-0 text-xs" style={{ color: "var(--text-muted)" }}>
          Vault: AES-256-GCM, key derived with PBKDF2-SHA256 ({vault?.header.kdf.iterations.toLocaleString()}{" "}
          iterations).
        </p>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------- AI section */

function AiProvidersSection({ onMessage }: { onMessage: (message: string) => void }) {
  const { settings, updateSettings, vault } = useVault();
  const [draft, setDraft] = useState<AiProviderConfig | null>(null);
  const [apiKey, setApiKey] = useState("");

  async function save() {
    if (!draft || !vault) return;
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

  async function remove(id: string) {
    if (!vault) return;
    const secrets = await loadSecrets(vault);
    delete secrets[id];
    await saveSecrets(vault, secrets);
    await updateSettings({
      aiProviders: settings.aiProviders.filter((p) => p.id !== id),
      activeAiProviderId: settings.activeAiProviderId === id ? null : settings.activeAiProviderId,
    });
    onMessage("Provider removed and its key deleted.");
  }

  return (
    <Section title="AI (optional)">
      <p className="m-0 text-sm" style={{ color: "var(--text-secondary)" }}>
        Everything works without this. Add a provider only if you want help reading receipts or
        answering questions about your spending.
      </p>

      {settings.aiProviders.length > 0 && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {settings.aiProviders.map((provider) => (
            <li
              key={provider.id}
              className="flex items-center justify-between gap-3 rounded-lg p-3"
              style={{ background: "var(--plane)" }}
            >
              <label className="flex flex-1 cursor-pointer items-center gap-3">
                <input
                  type="radio"
                  name="activeProvider"
                  checked={settings.activeAiProviderId === provider.id}
                  onChange={() => void updateSettings({ activeAiProviderId: provider.id })}
                />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {provider.label || KIND_LABELS[provider.kind]}
                  </span>
                  <span className="block truncate text-xs" style={{ color: "var(--text-muted)" }}>
                    {provider.model}
                    {provider.baseUrl ? ` · ${new URL(provider.baseUrl).host}` : ""}
                    {provider.redactBeforeSend ? " · redacts PII" : " · redaction off"}
                  </span>
                </span>
              </label>
              <span className="flex shrink-0 gap-1">
                <button type="button" className="btn px-2 py-1 text-xs" onClick={() => setDraft(provider)}>
                  Edit
                </button>
                <button
                  type="button"
                  className="btn btn-danger px-2 py-1 text-xs"
                  onClick={() => void remove(provider.id)}
                >
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {draft ? (
        <div className="flex flex-col gap-3 rounded-lg p-3" style={{ background: "var(--plane)" }}>
          <div>
            <label className="label" htmlFor="providerKind">
              Provider
            </label>
            <select
              id="providerKind"
              className="field"
              value={draft.kind}
              onChange={(event) => {
                const kind = event.target.value as AiProviderKind;
                setDraft({ ...draft, kind, ...KIND_DEFAULTS[kind] });
              }}
            >
              {AI_PROVIDER_KINDS.filter((kind) => kind !== "none").map((kind) => (
                <option key={kind} value={kind}>
                  {KIND_LABELS[kind]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="providerLabel">
              Name
            </label>
            <input
              id="providerLabel"
              className="field"
              value={draft.label}
              placeholder="My Anthropic key"
              onChange={(event) => setDraft({ ...draft, label: event.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="providerUrl">
              Endpoint
            </label>
            <input
              id="providerUrl"
              className="field"
              value={draft.baseUrl ?? ""}
              onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="providerModel">
              Model
            </label>
            <input
              id="providerModel"
              className="field"
              value={draft.model}
              onChange={(event) => setDraft({ ...draft, model: event.target.value })}
            />
          </div>

          <div>
            <label className="label" htmlFor="providerKey">
              {draft.kind === "agent-bridge" ? "Bridge token" : "API key"}
              {draft.kind === "ollama" && " (not needed for Ollama)"}
            </label>
            <input
              id="providerKey"
              className="field"
              type="password"
              autoComplete="off"
              value={apiKey}
              placeholder={draft.hasApiKey ? "•••••••• (leave blank to keep)" : ""}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
              Stored encrypted in your vault. Never written to browser storage in the clear.
            </p>
          </div>

          <Toggle
            label="Redact personal details before sending"
            hint="Strips card numbers, emails, phone numbers and URLs from receipt text."
            checked={draft.redactBeforeSend}
            onChange={(value) => setDraft({ ...draft, redactBeforeSend: value })}
          />
          <Toggle
            label="Allow sending the receipt image"
            hint="Needed for vision models. An image cannot be redacted — it goes as photographed."
            checked={draft.allowImageUpload}
            onChange={(value) => setDraft({ ...draft, allowImageUpload: value })}
          />

          <div className="flex gap-2">
            <button type="button" className="btn btn-primary flex-1" onClick={() => void save()}>
              Save provider
            </button>
            <button type="button" className="btn" onClick={() => setDraft(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          className="btn"
          onClick={() => {
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
          }}
        >
          Add a provider
        </button>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------ data panels */

function BackupPanel({ onMessage }: { onMessage: (message: string) => void }) {
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
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(file)], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeFilename(`betapouch-backup-${new Date().toISOString().slice(0, 10)}`, "json");
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 5_000);
      setPassphrase("");
      onMessage("Encrypted backup saved. It can only be opened with that passphrase.");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "The backup could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-lg p-3" style={{ background: "var(--plane)" }}>
      <h3 className="m-0 text-sm font-semibold">Encrypted backup</h3>
      <p className="mb-3 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Exports every record into one encrypted file. Safe to keep in cloud storage — without the
        passphrase it is noise. Receipt images are not included.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="field flex-1 basis-48"
          type="password"
          autoComplete="new-password"
          placeholder="Passphrase for this backup"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
        <button
          type="button"
          className="btn"
          onClick={() => void exportBackup()}
          disabled={busy || !strength.ok || expenses.length === 0}
        >
          Export
        </button>
      </div>
      {passphrase.length > 0 && !strength.ok && (
        <p className="mb-0 mt-2 text-xs" style={{ color: "var(--status-serious)" }}>
          {strength.problems[0]}
        </p>
      )}
    </div>
  );
}

function ImportPanel({
  onImport,
  onMessage,
}: {
  onImport: (records: Parameters<ReturnType<typeof useExpenses>["importExpenses"]>[0]) => Promise<number>;
  onMessage: (message: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [passphrase, setPassphrase] = useState("");

  async function handleFile(file: File) {
    try {
      if (file.size > 100 * 1024 * 1024) throw new Error("That file is too large to import.");
      const text = await file.text();

      // An encrypted backup and a plain export are both accepted; the shape
      // decides which, and both are validated before anything is stored.
      const asEnvelope = backupEnvelopeSchema.safeParse(JSON.parse(text));
      if (asEnvelope.success) {
        if (!passphrase) {
          onMessage("That is an encrypted backup — enter its passphrase first.");
          return;
        }
        const payload = backupPayloadSchema.parse(
          await decryptBackup(asEnvelope.data, passphrase),
        );
        const count = await onImport(payload.expenses);
        onMessage(`Restored ${count} ${count === 1 ? "record" : "records"} from the backup.`);
        setPassphrase("");
        return;
      }

      const result = importExpensesJson(text);
      const count = await onImport(result.expenses);
      onMessage(
        result.skipped.length
          ? `Imported ${count}; skipped ${result.skipped.length} record(s) that did not validate.`
          : `Imported ${count} ${count === 1 ? "record" : "records"}.`,
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "That file could not be imported.");
    }
  }

  return (
    <div className="rounded-lg p-3" style={{ background: "var(--plane)" }}>
      <h3 className="m-0 text-sm font-semibold">Restore or import</h3>
      <p className="mb-3 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Accepts a BetaPouch backup or a plain JSON export. Imported records get new ids, so nothing
        already here is overwritten.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="field flex-1 basis-48"
          type="password"
          autoComplete="off"
          placeholder="Backup passphrase (if encrypted)"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
        />
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
        <button type="button" className="btn" onClick={() => inputRef.current?.click()}>
          Choose file
        </button>
      </div>
    </div>
  );
}

function DangerZone({ onDestroyed }: { onDestroyed: () => void }) {
  const [confirmation, setConfirmation] = useState("");
  const armed = confirmation === "DELETE EVERYTHING";

  return (
    <div
      className="rounded-lg p-3"
      style={{ background: "var(--plane)", border: "1px solid var(--status-critical)" }}
    >
      <h3 className="m-0 text-sm font-semibold" style={{ color: "var(--status-critical)" }}>
        Delete everything
      </h3>
      <p className="mb-3 mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
        Erases the vault and every record on this device. There is no copy anywhere else and this
        cannot be undone. Export a backup first if you might want the data back.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          className="field flex-1 basis-48"
          placeholder="Type DELETE EVERYTHING"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
        />
        <button
          type="button"
          className="btn btn-danger"
          disabled={!armed}
          onClick={() => {
            void destroyEverything().then(() => {
              onDestroyed();
              location.reload();
            });
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
}

function PassphraseChanger({
  onChange,
  onDone,
}: {
  onChange: (current: string, next: string) => Promise<void>;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [error, setError] = useState<string | null>(null);
  const strength = assessPassphrase(next);

  if (!open) {
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        Change passphrase
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg p-3" style={{ background: "var(--plane)" }}>
      <input
        className="field"
        type="password"
        autoComplete="current-password"
        placeholder="Current passphrase"
        value={current}
        onChange={(event) => setCurrent(event.target.value)}
      />
      <input
        className="field"
        type="password"
        autoComplete="new-password"
        placeholder="New passphrase"
        value={next}
        onChange={(event) => setNext(event.target.value)}
      />
      {next && !strength.ok && (
        <p className="m-0 text-xs" style={{ color: "var(--status-serious)" }}>
          {strength.problems[0]}
        </p>
      )}
      {error && (
        <p className="m-0 text-xs" style={{ color: "var(--status-critical)" }}>
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="button"
          className="btn btn-primary flex-1"
          disabled={!current || !strength.ok}
          onClick={() => {
            setError(null);
            void onChange(current, next)
              .then(() => {
                setOpen(false);
                setCurrent("");
                setNext("");
                onDone();
              })
              .catch((caught: unknown) =>
                setError(caught instanceof Error ? caught.message : "That did not work."),
              );
          }}
        >
          Change it
        </button>
        <button type="button" className="btn" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- primitives */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="card flex flex-col gap-3 p-5">
      <h2 className="m-0 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0 flex-1">
        <div className="text-sm">{label}</div>
        {hint && (
          <div className="text-xs" style={{ color: "var(--text-muted)" }}>
            {hint}
          </div>
        )}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start justify-between gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-sm">{label}</span>
        {hint && (
          <span className="block text-xs" style={{ color: "var(--text-muted)" }}>
            {hint}
          </span>
        )}
      </span>
      <input
        type="checkbox"
        className="mt-1 h-5 w-5 shrink-0"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </label>
  );
}
