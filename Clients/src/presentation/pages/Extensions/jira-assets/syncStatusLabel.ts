/**
 * Labels for jira_assets_use_cases.sync_status, which the database limits to
 * these four values (jira_assets_use_cases_sync_status_chk). Each label is a
 * whole dictionary key, so the chip and the overview card translate the same
 * way; an unexpected value is shown as stored.
 */
export const SYNC_STATUS_LABEL: Record<string, string> = {
  synced: "Synced",
  pending: "Pending",
  failed: "Failed",
  stale: "Stale",
};

export const syncStatusLabel = (value: string, t: (key: string) => string): string =>
  SYNC_STATUS_LABEL[value] ? t(SYNC_STATUS_LABEL[value]) : value;
