import { registerSyncProvider } from "./registry";
import type { SyncProvider } from "./types";
import { jiraAssetsSyncProvider } from "../jira-assets/jiraAssets.syncProvider";
import { jiraIncidentsSyncProvider } from "../jira-incidents/jiraIncidents.syncProvider";

/** Every extension that runs on the sync engine. */
export const SYNC_PROVIDERS: SyncProvider[] = [jiraAssetsSyncProvider, jiraIncidentsSyncProvider];

let registered = false;

/** Register every provider once per process; the API router and the worker's jobs both call it. */
export function registerAllSyncProviders(): void {
  if (registered) return;
  registered = true;
  for (const provider of SYNC_PROVIDERS) registerSyncProvider(provider);
}
