import { UnknownSyncProviderError } from "./errors";
import { EXTENSION_KEY_PATTERN, SyncProvider } from "./types";

const providers = new Map<string, SyncProvider>();

/** Register an extension's provider. Called once per process (API and worker). */
export function registerSyncProvider(provider: SyncProvider): void {
  if (!EXTENSION_KEY_PATTERN.test(provider.key)) {
    throw new Error(`Invalid sync provider key "${provider.key}"`);
  }
  if (!provider.kinds.includes("manual")) {
    throw new Error(`Sync provider ${provider.key} must declare the "manual" kind`);
  }
  if (provider.scheduledKind && !provider.kinds.includes(provider.scheduledKind)) {
    throw new Error(
      `Sync provider ${provider.key}: scheduledKind "${provider.scheduledKind}" is not one of its kinds`,
    );
  }
  const existing = providers.get(provider.key);
  if (existing && existing !== provider) {
    throw new Error(`A sync provider for ${provider.key} is already registered`);
  }
  providers.set(provider.key, provider);
}

export function getSyncProvider(key: string): SyncProvider {
  const provider = providers.get(key);
  if (!provider) throw new UnknownSyncProviderError(key);
  return provider;
}

export function findSyncProvider(key: string): SyncProvider | undefined {
  return providers.get(key);
}

export function listSyncProviders(): SyncProvider[] {
  return [...providers.values()];
}

/** Kinds that count as "last run" for the due rule and as latest_run / previousRunId. */
export function statusKinds(provider: SyncProvider): string[] {
  return provider.scheduledKind ? [provider.scheduledKind, "manual"] : ["manual"];
}

export function __resetSyncProvidersForTests(): void {
  providers.clear();
}
