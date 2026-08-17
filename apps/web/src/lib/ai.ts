import {
  createProvider,
  extractedToDraft,
  prepareTextForProvider,
  type AiProvider,
  type AiProviderConfig,
  type ExpenseDraft,
  type Settings,
  type UnlockedVault,
} from "@betapouch/core";
import { loadSecrets } from "./db";

/**
 * Wiring between the encrypted secrets store and the core provider adapters.
 *
 * Keys are read out of the vault at call time and passed straight into the
 * adapter, so a key is only ever in memory for the duration of a request and
 * is never held in component state where a React devtools dump would show it.
 */

export interface ResolvedProvider {
  config: AiProviderConfig;
  provider: AiProvider;
  /** Host the request will reach, or null when it stays on this device. */
  destination: string | null;
}

export function activeProviderConfig(settings: Settings): AiProviderConfig | null {
  if (!settings.activeAiProviderId) return null;
  return settings.aiProviders.find((p) => p.id === settings.activeAiProviderId) ?? null;
}

export async function resolveProvider(
  vault: UnlockedVault,
  settings: Settings,
): Promise<ResolvedProvider | null> {
  const config = activeProviderConfig(settings);
  if (!config || config.kind === "none") return null;

  const secrets = await loadSecrets(vault);
  const credentials = secrets[config.id] ?? {};
  const provider = createProvider(config, credentials);
  return { config, provider, destination: provider.destination() };
}

export interface ExtractionOutcome {
  draft: ExpenseDraft;
  /** What redaction stripped before sending, for the "what was sent" notice. */
  redacted: Record<string, number>;
}

export async function extractWithAi(
  resolved: ResolvedProvider,
  input: { text: string; image?: { mimeType: string; dataB64: string } },
  signal?: AbortSignal,
): Promise<ExtractionOutcome> {
  const prepared = prepareTextForProvider(resolved.config, input.text);
  const extracted = await resolved.provider.extract({
    text: prepared.text,
    // Images cannot be redacted, so they only go when explicitly allowed.
    image: resolved.config.allowImageUpload ? input.image : undefined,
    signal,
  });
  return { draft: extractedToDraft(extracted), redacted: prepared.removed };
}
