import {
  AI_PROVIDER_KINDS,
  expensesToCsv,
  newId,
  safeFilename,
  type AiProviderConfig,
  type AiProviderKind,
} from "@betapouch/core";
import { File, Paths } from "expo-file-system";
import { useState } from "react";
import { Pressable, ScrollView, Switch, Text, View } from "react-native";
import { CurrencyPicker } from "../components/CurrencyPicker";
import { Button, Card, Field, Heading, Muted, Notice } from "../components/ui";
import { destroyEverything, loadSecrets, saveSecrets } from "../lib/db";
import { useExpenses } from "../lib/expenses";
import { useVault } from "../lib/vault";
import { useTheme } from "../theme";

const KIND_LABELS: Record<AiProviderKind, string> = {
  none: "None",
  anthropic: "Anthropic (your API key)",
  "openai-compatible": "OpenAI-compatible",
  ollama: "Ollama on your network",
  "agent-bridge": "Agent bridge",
};

const KIND_DEFAULTS: Record<AiProviderKind, { baseUrl: string; model: string }> = {
  none: { baseUrl: "", model: "" },
  anthropic: { baseUrl: "https://api.anthropic.com", model: "claude-sonnet-5" },
  "openai-compatible": { baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  ollama: { baseUrl: "http://localhost:11434", model: "llama3.2-vision" },
  "agent-bridge": { baseUrl: "http://127.0.0.1:4747", model: "claude" },
};

export function SettingsScreen() {
  const theme = useTheme();
  const {
    settings,
    updateSettings,
    vault,
    lock,
    biometricAvailable,
    biometricEnabled,
    setBiometricUnlock,
  } = useVault();
  const { expenses } = useExpenses();
  const [message, setMessage] = useState<string | null>(null);
  const [biometricPassphrase, setBiometricPassphrase] = useState("");
  const [confirmDelete, setConfirmDelete] = useState("");

  async function exportCsv() {
    try {
      const file = new File(
        Paths.document,
        safeFilename(`betapouch-${new Date().toISOString().slice(0, 10)}`, "csv"),
      );
      file.create({ overwrite: true });
      file.write(expensesToCsv(expenses));
      setMessage(
        `Exported to ${file.uri}. This file is NOT encrypted — move it somewhere you trust, or delete it once you are done.`,
      );
    } catch {
      setMessage("The export could not be written.");
    }
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 40 }}
      style={{ backgroundColor: theme.plane }}
    >
      <Heading>Settings</Heading>
      {message && <Notice>{message}</Notice>}

      <Card style={{ gap: 14 }}>
        <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>General</Text>
        <CurrencyPicker
          label="Base currency"
          value={settings.baseCurrency}
          locale={settings.locale}
          onChange={(code) => void updateSettings({ baseCurrency: code })}
        />
        <Field
          label="Language & formatting"
          value={settings.locale}
          autoCapitalize="none"
          onChangeText={(value) => void updateSettings({ locale: value })}
        />
      </Card>

      <Card style={{ gap: 14 }}>
        <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>Privacy & security</Text>

        <Toggle
          label="Lock when the app is backgrounded"
          hint="Also keeps your amounts out of the app-switcher snapshot."
          value={settings.lockOnHide}
          onChange={(value) => void updateSettings({ lockOnHide: value })}
        />
        <Toggle
          label="Strip location data from photos"
          hint="Removes the GPS tag a phone camera writes into every image."
          value={settings.stripImageMetadata}
          onChange={(value) => void updateSettings({ stripImageMetadata: value })}
        />

        {biometricAvailable && (
          <View style={{ gap: 8 }}>
            <Toggle
              label="Unlock with biometrics"
              hint="Keeps your passphrase in this device's secure keystore, behind Face ID or a fingerprint. Never included in a cloud backup."
              value={biometricEnabled}
              onChange={(value) => {
                void setBiometricUnlock(value, biometricPassphrase)
                  .then(() => {
                    setBiometricPassphrase("");
                    setMessage(value ? "Biometric unlock enabled." : "Biometric unlock disabled and the stored passphrase deleted.");
                  })
                  .catch((error: unknown) =>
                    setMessage(error instanceof Error ? error.message : "That did not work."),
                  );
              }}
            />
            {!biometricEnabled && (
              <Field
                label="Passphrase (to enable)"
                value={biometricPassphrase}
                onChangeText={setBiometricPassphrase}
                secureTextEntry
                autoCapitalize="none"
              />
            )}
          </View>
        )}

        <Button label="Lock now" onPress={lock} />
      </Card>

      <AiSection onMessage={setMessage} />

      <Card style={{ gap: 12 }}>
        <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>Your data</Text>
        <Muted>
          {expenses.length} {expenses.length === 1 ? "record" : "records"} on this device, encrypted
          at rest.
        </Muted>
        <Button label="Export CSV" onPress={() => void exportCsv()} />

        <View
          style={{
            borderWidth: 1,
            borderColor: theme.critical,
            borderRadius: 10,
            padding: 12,
            gap: 10,
            marginTop: 4,
          }}
        >
          <Text style={{ color: theme.critical, fontWeight: "600", fontSize: 13 }}>
            Delete everything
          </Text>
          <Muted>
            Erases the vault and every record on this device. There is no copy anywhere else.
          </Muted>
          <Field
            value={confirmDelete}
            onChangeText={setConfirmDelete}
            placeholder="Type DELETE EVERYTHING"
            autoCapitalize="characters"
          />
          <Button
            label="Delete"
            variant="danger"
            disabled={confirmDelete !== "DELETE EVERYTHING"}
            onPress={() => {
              void destroyEverything().then(() => {
                lock();
                setMessage("Everything was deleted.");
              });
            }}
          />
        </View>
      </Card>

      <Card style={{ gap: 8 }}>
        <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>About</Text>
        <Muted>
          BetaPouch has no server and no account. The only network requests it makes are the ones
          you configure above.
        </Muted>
        <Muted>
          Vault: AES-256-GCM, key derived with PBKDF2-SHA256 (
          {vault?.header.kdf.iterations.toLocaleString()} iterations).
        </Muted>
      </Card>
    </ScrollView>
  );
}

function AiSection({ onMessage }: { onMessage: (message: string) => void }) {
  const theme = useTheme();
  const { settings, updateSettings, vault } = useVault();
  const [draft, setDraft] = useState<AiProviderConfig | null>(null);
  const [apiKey, setApiKey] = useState("");

  async function save() {
    if (!draft || !vault) return;
    const providers = settings.aiProviders.some((p) => p.id === draft.id)
      ? settings.aiProviders.map((p) =>
          p.id === draft.id ? { ...draft, hasApiKey: Boolean(apiKey) || p.hasApiKey } : p,
        )
      : [...settings.aiProviders, { ...draft, hasApiKey: Boolean(apiKey) }];

    if (apiKey.trim()) {
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

  return (
    <Card style={{ gap: 12 }}>
      <Text style={{ color: theme.textPrimary, fontWeight: "600" }}>AI (optional)</Text>
      <Muted>
        Everything works without this. Add a provider only if you want a model to read receipt
        photos for you.
      </Muted>

      {settings.aiProviders.map((provider) => (
        <Pressable
          key={provider.id}
          accessibilityRole="radio"
          accessibilityState={{ selected: settings.activeAiProviderId === provider.id }}
          onPress={() => void updateSettings({ activeAiProviderId: provider.id })}
          style={{
            padding: 12,
            borderRadius: 10,
            backgroundColor: theme.plane,
            borderWidth: 1,
            borderColor:
              settings.activeAiProviderId === provider.id ? theme.series1 : "transparent",
          }}
        >
          <Text style={{ color: theme.textPrimary, fontSize: 14 }}>
            {provider.label || KIND_LABELS[provider.kind]}
          </Text>
          <Text style={{ color: theme.textMuted, fontSize: 11 }}>
            {provider.model}
            {provider.allowImageUpload ? " · may receive images" : " · text only"}
          </Text>
        </Pressable>
      ))}

      {draft ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
            {AI_PROVIDER_KINDS.filter((kind) => kind !== "none").map((kind) => (
              <Pressable
                key={kind}
                accessibilityRole="radio"
                accessibilityState={{ selected: draft.kind === kind }}
                onPress={() => setDraft({ ...draft, kind, ...KIND_DEFAULTS[kind] })}
                style={{
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: draft.kind === kind ? theme.series1 : theme.hairline,
                }}
              >
                <Text style={{ color: theme.textSecondary, fontSize: 11 }}>{KIND_LABELS[kind]}</Text>
              </Pressable>
            ))}
          </View>

          <Field label="Name" value={draft.label} onChangeText={(v) => setDraft({ ...draft, label: v })} />
          <Field
            label="Endpoint"
            value={draft.baseUrl ?? ""}
            autoCapitalize="none"
            onChangeText={(v) => setDraft({ ...draft, baseUrl: v })}
          />
          <Field
            label="Model"
            value={draft.model}
            autoCapitalize="none"
            onChangeText={(v) => setDraft({ ...draft, model: v })}
          />
          <Field
            label={draft.kind === "agent-bridge" ? "Bridge token" : "API key"}
            value={apiKey}
            onChangeText={setApiKey}
            secureTextEntry
            autoCapitalize="none"
            hint="Stored encrypted in your vault."
          />

          <Toggle
            label="Redact personal details before sending"
            value={draft.redactBeforeSend}
            onChange={(value) => setDraft({ ...draft, redactBeforeSend: value })}
          />
          <Toggle
            label="Allow sending the receipt photo"
            hint="Required for a model to read a photo. An image cannot be redacted — it goes as taken."
            value={draft.allowImageUpload}
            onChange={(value) => setDraft({ ...draft, allowImageUpload: value })}
          />

          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label="Save" variant="primary" onPress={() => void save()} style={{ flex: 2 }} />
            <Button label="Cancel" onPress={() => setDraft(null)} style={{ flex: 1 }} />
          </View>
        </View>
      ) : (
        <Button
          label="Add a provider"
          onPress={() => {
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
        />
      )}
    </Card>
  );
}

function Toggle({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
}) {
  const theme = useTheme();
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 12 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: theme.textPrimary, fontSize: 14 }}>{label}</Text>
        {hint && <Text style={{ color: theme.textMuted, fontSize: 11 }}>{hint}</Text>}
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}
