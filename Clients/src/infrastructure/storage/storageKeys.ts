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
} as const;
