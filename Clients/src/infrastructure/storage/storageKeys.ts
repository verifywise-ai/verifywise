import type { StorageKeyConfig, StorageValueMap } from "./storage.types";

/** Namespace prefix for all VerifyWise-owned storage keys. */
export const NAMESPACE = "verifywise_";

/**
 * Registry of logical keys -> canonical namespaced key + options.
 * Extend this alongside `StorageValueMap` as more callers are migrated.
 *
 * `as const satisfies ...` keeps the literal key strings (for autocomplete and
 * exact-string tests) while enforcing that every `StorageValueMap` name has an entry.
 */
export const KEYS = {
  preferences: { key: "verifywise_preferences" },
  tasksViewTab: { key: "verifywise_tasks_view_tab", raw: true },
  dashboardMetricsCache: {
    key: "verifywise_dashboard_metrics_cache",
    legacyKey: "dashboard_metrics_cache",
  },

  // UI language (transient)
  language: { key: "vw_lang_prototype", raw: true },

  // Theme toggle state (transient)
  darkMode: { key: "vw_dark_mode", raw: true },

  // Dashboard demo data button dismissal
  dashboardDemoHidden: {
    key: "verifywise_hide_demo_data_button",
    legacyKey: "hideDemoDataButton",
  },

  // AI Gateway dashboards
  aiGatewayAnalyticsPeriod: {
    key: "verifywise_ai_gateway_analytics_period",
    raw: true,
    legacyKey: "vw_ai_gateway_analytics_period",
  },

  // Evals dashboard
  evalsLastProjectId: {
    key: "verifywise_evals_last_project_id",
    raw: true,
    legacyKey: "evals_last_project_id",
  },
  evalsRecentExperiments: {
    key: "verifywise_evals_recent_experiments",
    legacyKey: "evals_recent_experiments",
  },
  evalsRecentProjects: {
    key: "verifywise_evals_recent_projects",
    legacyKey: "evals_recent_projects",
  },
  evalsLocalProviders: {
    key: "verifywise_evals_local_providers",
    legacyKey: "evals_local_providers",
  },

  // Start here onboarding
  startHereProgress: { key: "verifywise_start_here_progress" },
  startHereConfettiFired: {
    key: "verifywise_start_here_confetti_fired",
    raw: true,
  },

  // Framework selection / tabs
  frameworkSelected: {
    key: "verifywise_framework_selected",
    raw: true,
    legacyKey: "framework_selected",
  },
  iso27001Tab: {
    key: "verifywise_iso27001_tab",
    raw: true,
    legacyKey: "iso27001_tab",
  },
  iso42001Tab: {
    key: "verifywise_iso42001_tab",
    raw: true,
    legacyKey: "iso42001_tab",
  },
  nistAiRmfTab: {
    key: "verifywise_nist_ai_rmf_tab",
    raw: true,
    legacyKey: "nist_ai_rmf_tab",
  },
} as const satisfies Record<keyof StorageValueMap, StorageKeyConfig>;

/**
 * Factories for dynamic / parameterized keys that cannot be enumerated in `KEYS`.
 * Each returns a fully namespaced key string.
 *
 * Note: `sorting` and `deadlineSnooze` already match their pre-existing key format
 * (`verifywise_<key>_sorting`, `verifywise_deadline_snooze_<id>`), so migrating those
 * callers preserves stored values. `paginationRows` and `columns` gain the namespace
 * prefix and therefore reset once on first load (accepted for these UI preferences).
 */
export const dynamicKeys = {
  paginationRows: (tableKey: string) => `${NAMESPACE}pagination_rows_${tableKey}`,
  sorting: (storageKey: string) => `${NAMESPACE}${storageKey}_sorting`,
  columns: (tableId: string) => `${NAMESPACE}columns_${tableId}`,
  deadlineSnooze: (userId: number | string) => `${NAMESPACE}deadline_snooze_${userId}`,
  viewMode: (key: string) => `${NAMESPACE}view_mode_${key}`,
  deadlineCollapsedSections: () => `${NAMESPACE}deadline_collapsed_sections`,
  startHereDismissed: (suffix: string) => `${NAMESPACE}start_here_${suffix}_dismissed`,
  aiGatewayPlaygroundEndpoint: () => `${NAMESPACE}playground_endpoint`,
  aiGatewayPlaygroundTemperature: () => `${NAMESPACE}playground_temperature`,
  aiGatewayPlaygroundMaxTokens: () => `${NAMESPACE}playground_max_tokens`,
} as const;
