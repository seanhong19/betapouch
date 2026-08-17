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

export interface ResolvedProvider {
  config: AiProviderConfig;
  provider: AiProvider;
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
  const provider = createProvider(config, secrets[config.id] ?? {});
  return { config, provider, destination: provider.destination() };
}

export interface ExtractionOutcome {
  draft: ExpenseDraft;
  redacted: Record<string, number>;
}

/**
 * Mobile has no on-device OCR (see docs/ARCHITECTURE.md — it needs a native
 * ML Kit module), so extraction here is image-first and requires a vision
 * model with image upload explicitly enabled. Anything else falls back to the
 * form, which is always available.
 */
export async function extractWithAi(
  resolved: ResolvedProvider,
  input: { text: string; image?: { mimeType: string; dataB64: string } },
  signal?: AbortSignal,
): Promise<ExtractionOutcome> {
  const prepared = prepareTextForProvider(resolved.config, input.text);
  const extracted = await resolved.provider.extract({
    text: prepared.text,
    image: resolved.config.allowImageUpload ? input.image : undefined,
    signal,
  });
  return { draft: extractedToDraft(extracted), redacted: prepared.removed };
}
