import { createProvider, extractedToDraft, prepareTextForProvider, } from "@betapouch/core";
import { loadSecrets } from "./db";
export function activeProviderConfig(settings) {
    if (!settings.activeAiProviderId)
        return null;
    return settings.aiProviders.find((p) => p.id === settings.activeAiProviderId) ?? null;
}
export async function resolveProvider(vault, settings) {
    const config = activeProviderConfig(settings);
    if (!config || config.kind === "none")
        return null;
    const secrets = await loadSecrets(vault);
    const credentials = secrets[config.id] ?? {};
    const provider = createProvider(config, credentials);
    return { config, provider, destination: provider.destination() };
}
export async function extractWithAi(resolved, input, signal) {
    const prepared = prepareTextForProvider(resolved.config, input.text);
    const extracted = await resolved.provider.extract({
        text: prepared.text,
        // Images cannot be redacted, so they only go when explicitly allowed.
        image: resolved.config.allowImageUpload ? input.image : undefined,
        signal,
    });
    return { draft: extractedToDraft(extracted), redacted: prepared.removed };
}
