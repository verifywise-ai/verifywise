/**
 * Types for the typed StorageService.
 *
 * Extend `StorageValueMap` (and the matching `KEYS` registry in `storageKeys.ts`)
 * as more callers are migrated onto the service.
 */

/** Supported UI languages. */
export type UserLanguage = "en" | "de" | "fr" | "es";

/** User preferences blob persisted under `verifywise_preferences`. */
export interface UserPreferences {
  date_format?: string;
  language?: UserLanguage;
  theme?: "light" | "dark" | "system";
  [key: string]: unknown;
}

/** A single cached metric entry. */
export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
}

/** Dashboard metrics cache persisted under `verifywise_dashboard_metrics_cache`. */
export type DashboardMetricsCache = Record<string, CacheEntry>;

/** A recently-viewed experiment in the Evals dashboard. */
export interface RecentExperiment {
  id: string;
  name: string;
  projectId: string;
}

/** A recently-viewed project in the Evals dashboard. */
export interface RecentProject {
  id: string;
  name: string;
}

/** A locally-configured LLM provider in the Evals dashboard. */
export interface LocalProvider {
  id: string;
  type: "ollama" | "local";
  name: string;
  url: string;
  addedAt: string;
}

/**
 * Logical storage key -> value type. The keys of this interface are the only
 * names accepted by the typed `get`/`set`/`removeKey` accessors.
 */
export interface StorageValueMap {
  preferences: UserPreferences;
  tasksViewTab: string;
  dashboardMetricsCache: DashboardMetricsCache;

  // UI language (transient; server remains source of truth for persisted language)
  language: UserLanguage;

  // Theme toggle state (transient until backend persistence is added)
  darkMode: boolean;

  // Dashboard demo data button dismissal
  dashboardDemoHidden: boolean;

  // AI Gateway dashboards
  aiGatewayAnalyticsPeriod: string;

  // Evals dashboard
  evalsLastProjectId: string;
  evalsRecentExperiments: RecentExperiment[];
  evalsRecentProjects: RecentProject[];
  evalsLocalProviders: LocalProvider[];

  // Start here onboarding
  startHereProgress: boolean[];
  startHereConfettiFired: boolean;

  // Framework selection / tabs
  frameworkSelected: string;
  iso27001Tab: string;
  iso42001Tab: string;
  nistAiRmfTab: string;
}

/** Options controlling how a value is read from / written to storage. */
export interface StorageOptions {
  /** Store and read the value as a raw string instead of JSON. Default: false. */
  raw?: boolean;
  /**
   * Legacy (old / un-namespaced) key to migrate from. On the first `get`, if the
   * canonical key is absent but the legacy key is present, the value is copied to
   * the canonical key, the legacy key is removed, and the value is returned.
   */
  legacyKey?: string;
}

/** Registry entry: canonical namespaced key + read/write options. */
export interface StorageKeyConfig extends StorageOptions {
  key: string;
}
