/**
 * The factory that picks the search provider the configuration asks for. The shapes, the provider
 * interface and SearchProviderError live in searchTypes.ts and are re-exported from here, so
 * callers import all of it from this file.
 */
import { getVendorResearchConfig, VendorResearchConfig } from "./config";
import { SearchProvider } from "./searchTypes";
import { createTavilyProvider } from "./tavilyProvider";

export * from "./searchTypes";

/**
 * The provider the configuration asks for, or null when search is not configured. `fetchImpl`
 * exists so tests can stand in for the network.
 */
export function createSearchProvider(
  config: VendorResearchConfig = getVendorResearchConfig(),
  fetchImpl?: typeof fetch,
): SearchProvider | null {
  if (config.searchProvider === "tavily" && config.tavilyApiKey) {
    return createTavilyProvider(config.tavilyApiKey, fetchImpl);
  }
  return null;
}
