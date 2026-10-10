/**
 * Settings for the vendor research agent, read from the environment.
 *
 * `process.env` is read only as the default argument of getVendorResearchConfig. Anything that
 * needs other values (tests, mostly) passes an env object instead.
 */

export interface VendorResearchConfig {
  /** The configured search provider, or null when none is set or the name is not supported. */
  searchProvider: "tavily" | null;
  /** The customer's own Tavily key. Never log it and never return it from an API. */
  tavilyApiKey: string | null;
  /** Whether research starts by itself after a vendor is created. */
  autoRun: boolean;
  /** Minutes a vendor must wait between two research runs; 0 means no wait. */
  manualCooldownMinutes: number;
  /** Research runs one organization may start in a rolling 24 hours, automatic and manual. */
  dailyRunCap: number;
}

const DEFAULT_MANUAL_COOLDOWN_MINUTES = 10;
const DEFAULT_DAILY_RUN_CAP = 50;

/**
 * A whole number of at least `minimum`, or `fallback` for anything else. The text is checked
 * before it is converted because Number("") and Number("  ") are 0, which would quietly turn a
 * blank setting into "no cooldown".
 */
function parseWholeNumber(raw: string | undefined, minimum: number, fallback: number): number {
  const text = (raw ?? "").trim();
  if (!/^\d+$/.test(text)) return fallback;
  const value = Number(text);
  return Number.isSafeInteger(value) && value >= minimum ? value : fallback;
}

export function getVendorResearchConfig(
  env: NodeJS.ProcessEnv = process.env,
): VendorResearchConfig {
  const provider = (env.VENDOR_RESEARCH_SEARCH_PROVIDER ?? "").trim().toLowerCase();
  const apiKey = (env.TAVILY_API_KEY ?? "").trim();
  const autoRun = (env.VENDOR_RESEARCH_AUTO_RUN ?? "").trim().toLowerCase();

  return {
    searchProvider: provider === "tavily" ? "tavily" : null,
    tavilyApiKey: apiKey === "" ? null : apiKey,
    autoRun: autoRun !== "false",
    manualCooldownMinutes: parseWholeNumber(
      env.VENDOR_RESEARCH_MANUAL_COOLDOWN_MINUTES,
      0,
      DEFAULT_MANUAL_COOLDOWN_MINUTES,
    ),
    dailyRunCap: parseWholeNumber(env.VENDOR_RESEARCH_DAILY_RUN_CAP, 1, DEFAULT_DAILY_RUN_CAP),
  };
}

/** True when a supported search provider is set and has the key it needs. */
export function isSearchConfigured(
  config: VendorResearchConfig = getVendorResearchConfig(),
): boolean {
  return config.searchProvider === "tavily" && Boolean(config.tavilyApiKey);
}
