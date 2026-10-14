jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import { SyncValidationError } from "../errors";
import {
  findDueRuns,
  getSchedule,
  parseIntervalHours,
  parseSchedulePatch,
  recordFailureForSchedule,
  resetScheduleFailures,
  saveSchedule,
} from "../schedule";
import { backoffHours, DUE_RUNS_SQL } from "../sql";
import type { SyncProvider } from "../types";

const mockQuery = sequelize.query as jest.Mock;
const TX = { id: "tx" };
const provider: SyncProvider = {
  key: "demo-ext",
  kinds: ["manual", "scheduled"],
  scheduledKind: "scheduled",
  readiness: async () => ({ ready: true }),
  run: async () => ({ counts: {} }),
};

beforeEach(() => mockQuery.mockReset());

describe("parseIntervalHours", () => {
  it("accepts whole hours from 1 to 168, as numbers or numeric strings", () => {
    expect(parseIntervalHours(1)).toBe(1);
    expect(parseIntervalHours(168)).toBe(168);
    expect(parseIntervalHours(" 12 ")).toBe(12);
  });

  it.each([0, 169, -5, 1.5, "12.5", "abc", "", null, undefined, true, {}])("rejects %p", (raw) => {
    expect(() => parseIntervalHours(raw)).toThrow(SyncValidationError);
  });
});

describe("parseSchedulePatch", () => {
  it("keeps only the fields that were sent", () => {
    expect(parseSchedulePatch({ enabled: true })).toEqual({
      enabled: true,
      intervalHours: undefined,
    });
    expect(parseSchedulePatch({ interval_hours: "6" })).toEqual({
      enabled: undefined,
      intervalHours: 6,
    });
  });

  it.each([[{}], [undefined], [{ enabled: "yes" }], [{ interval_hours: null }]])(
    "rejects %p",
    (body) => {
      expect(() => parseSchedulePatch(body)).toThrow(SyncValidationError);
    },
  );
});

describe("schedule rows", () => {
  it("reads the org's row for the extension", async () => {
    mockQuery.mockResolvedValue([
      { enabled: true, interval_hours: 6, consecutive_failures: 0, failing_since: null },
    ]);
    await expect(getSchedule("demo-ext", 5)).resolves.toEqual({
      enabled: true,
      interval_hours: 6,
      consecutive_failures: 0,
      failing_since: null,
    });
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("WHERE organization_id = :orgId AND extension_key = :key");
    expect(options.replacements).toEqual({ orgId: 5, key: "demo-ext" });
  });

  it("returns null when the org has no schedule yet", async () => {
    mockQuery.mockResolvedValue([]);
    await expect(getSchedule("demo-ext", 5)).resolves.toBeNull();
  });

  it("upserts only the fields given, with defaults for a new row", async () => {
    mockQuery.mockResolvedValue([
      [{ enabled: true, interval_hours: 24, consecutive_failures: 0, failing_since: null }],
      1,
    ]);
    await saveSchedule("demo-ext", 5, { enabled: true }, { userId: 7, transaction: TX as never });
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("ON CONFLICT (organization_id, extension_key) DO UPDATE");
    expect(sql).toContain("COALESCE(:enabled, extension_sync_settings.enabled)");
    expect(sql).toContain("COALESCE(:intervalHours, extension_sync_settings.interval_hours)");
    expect(options.replacements).toEqual({
      orgId: 5,
      key: "demo-ext",
      enabled: true,
      intervalHours: null,
      defaultInterval: 24,
      userId: 7,
    });
    expect(sql).toContain("updated_by = :userId");
    expect(options.transaction).toBe(TX);
  });

  it("starts a failure streak at the failed run's start and counts it up", async () => {
    mockQuery.mockResolvedValue([[], 0]);
    const startedAt = new Date("2026-10-12T10:00:00Z");
    await recordFailureForSchedule("demo-ext", 5, startedAt, TX as never);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("consecutive_failures = consecutive_failures + 1");
    expect(sql).toContain("failing_since = COALESCE(failing_since, :startedAt)");
    expect(options).toMatchObject({
      replacements: { orgId: 5, key: "demo-ext", startedAt },
      transaction: TX,
    });
  });

  it("clears the streak", async () => {
    mockQuery.mockResolvedValue([[], 0]);
    await resetScheduleFailures("demo-ext", 5);
    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain("SET consecutive_failures = 0, failing_since = NULL");
  });
});

describe("backoff and the due query", () => {
  it.each([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 4],
    [4, 8],
    [5, 16],
    [6, 24],
    [7, 24],
    [2000, 24],
  ])("backs off %p failures by %p hours", (failures, hours) => {
    expect(backoffHours(failures)).toBe(hours);
  });

  it("decides everything in one SQL statement", () => {
    expect(DUE_RUNS_SQL).toContain("ee.enabled = TRUE");
    expect(DUE_RUNS_SQL).toContain("s.enabled = TRUE");
    expect(DUE_RUNS_SQL).toContain("r.kind IN (:statusKinds) AND r.status <> 'skipped'");
    expect(DUE_RUNS_SQL).toContain("NOT EXISTS (SELECT 1 FROM extension_sync_runs live");
    expect(DUE_RUNS_SQL).toContain("GREATEST(s.interval_hours,");
    // The exponent is clamped, so a long failure streak cannot overflow power().
    expect(DUE_RUNS_SQL).toContain("power(2, LEAST(s.consecutive_failures, 6) - 1)");
  });

  it("asks for one extension's due orgs with its status kinds", async () => {
    mockQuery.mockResolvedValue([{ organization_id: 5 }]);
    await expect(findDueRuns(provider)).resolves.toEqual([{ organization_id: 5 }]);
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({
      key: "demo-ext",
      statusKinds: ["scheduled", "manual"],
    });
  });

  it("has nothing due for a provider without a schedule", async () => {
    await expect(findDueRuns({ ...provider, scheduledKind: undefined })).resolves.toEqual([]);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
