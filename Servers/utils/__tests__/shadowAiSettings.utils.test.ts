/**
 * Shadow AI settings save: an organization with no settings row yet must get
 * one on its first save (a plain UPDATE changed nothing), and later saves only
 * change the submitted fields.
 */

import { describe, it, expect, beforeEach, jest } from "@jest/globals";

jest.mock("../../database/db", () => ({
  __esModule: true,
  sequelize: {
    query: jest.fn(),
  },
}));

import {
  getSettingsQuery,
  lockShadowAiSettings,
  updateSettingsQuery,
  SHADOW_AI_SETTINGS_DEFAULTS,
} from "../shadowAiConfig.utils";
import { sequelize } from "../../database/db";

const mockQuery = sequelize.query as unknown as jest.Mock<(...args: any[]) => Promise<any>>;

function lastCall() {
  const [sql, options] = mockQuery.mock.calls[mockQuery.mock.calls.length - 1] as [
    string,
    { replacements: Record<string, unknown> },
  ];
  return { sql: sql.replace(/\s+/g, " "), replacements: options.replacements };
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe("updateSettingsQuery", () => {
  it("inserts the row when the organization has none, updating it on conflict", async () => {
    mockQuery.mockResolvedValueOnce([[{ organization_id: 7, retention_events_days: 14 }], 1]);

    const saved = await updateSettingsQuery(7, { retention_events_days: 14, updated_by: 3 });

    const { sql, replacements } = lastCall();
    expect(sql).toContain("INSERT INTO shadow_ai_settings");
    expect(sql).toContain("ON CONFLICT (organization_id) DO UPDATE SET");
    expect(sql).not.toMatch(/verifywise\./);
    expect(replacements).toMatchObject({
      organizationId: 7,
      ret_events: 14,
      ret_rollups: null,
      ret_alerts: null,
      rate_limit: null,
      updated_by: 3,
      default_ret_rollups: SHADOW_AI_SETTINGS_DEFAULTS.retention_daily_rollups_days,
    });
    expect(saved).toEqual({ organization_id: 7, retention_events_days: 14 });
  });

  it("keeps stored values for fields that were not submitted", async () => {
    mockQuery.mockResolvedValueOnce([[{}], 1]);

    await updateSettingsQuery(7, { rate_limit_max_events_per_hour: 50 });

    const { sql } = lastCall();
    expect(sql).toContain("retention_events_days = COALESCE(:ret_events, s.retention_events_days)");
    expect(sql).toContain("updated_by = COALESCE(:updated_by, s.updated_by)");
  });

  it("clamps negative values at zero", async () => {
    mockQuery.mockResolvedValueOnce([[{}], 1]);

    await updateSettingsQuery(7, { retention_alert_history_days: -5 });

    expect(lastCall().replacements.ret_alerts).toBe(0);
  });

  it("uses the same SQL whatever fields are submitted", async () => {
    mockQuery.mockResolvedValue([[{}], 1]);

    await updateSettingsQuery(7, { retention_events_days: 1 });
    const first = lastCall().sql;
    await updateSettingsQuery(7, { rate_limit_max_events_per_hour: 2, updated_by: 1 });

    expect(lastCall().sql).toBe(first);
  });
});

describe("getSettingsQuery", () => {
  it("returns the defaults when the organization has no row", async () => {
    mockQuery.mockResolvedValueOnce([[], 0]);

    await expect(getSettingsQuery(7)).resolves.toEqual(SHADOW_AI_SETTINGS_DEFAULTS);
  });
});

describe("lockShadowAiSettings", () => {
  it("creates a missing row, then reads it FOR UPDATE in the caller's transaction", async () => {
    const tx = {} as any;
    mockQuery
      .mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([[{ organization_id: 7, retention_events_days: 30 }], 1]);

    const row = await lockShadowAiSettings(7, tx);

    const [insertSql, insertOpts] = mockQuery.mock.calls[0] as [string, any];
    const [selectSql, selectOpts] = mockQuery.mock.calls[1] as [string, any];
    expect(insertSql.replace(/\s+/g, " ")).toContain("ON CONFLICT (organization_id) DO NOTHING");
    expect(selectSql).toContain("FOR UPDATE");
    expect(insertOpts.transaction).toBe(tx);
    expect(selectOpts.transaction).toBe(tx);
    expect(row).toEqual({ organization_id: 7, retention_events_days: 30 });
  });
});
