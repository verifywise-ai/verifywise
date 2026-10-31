/**
 * SQL building block for Jira Assets' TIMESTAMP WITHOUT TIME ZONE columns
 * (`jira_assets_use_cases.missing_in_jira_since`), which hold UTC wall-clock
 * time. Run claims, history and schedules moved to the sync engine
 * (extensions/sync-engine, TIMESTAMPTZ); see the "Scheduled sync" section of
 * docs/technical/infrastructure/extensions.md.
 */

/** Current time as a UTC TIMESTAMP WITHOUT TIME ZONE. */
export const SQL_NOW_UTC = "(NOW() AT TIME ZONE 'UTC')";
