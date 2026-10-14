jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import { __resetSyncProvidersForTests, registerSyncProvider } from "../registry";
import { getRunStatus, hasLiveRun, latestStatusRunId, listRuns, parseRunsLimit } from "../status";

const mockQuery = sequelize.query as jest.Mock;

beforeAll(() => {
  __resetSyncProvidersForTests();
  registerSyncProvider({
    key: "demo-ext",
    kinds: ["manual", "scheduled", "import"],
    scheduledKind: "scheduled",
    readiness: async () => ({ ready: true }),
    run: async () => ({ counts: {} }),
  });
});
beforeEach(() => mockQuery.mockReset());

describe("live run and previous run", () => {
  it("checks liveness for one extension and org in SQL", async () => {
    mockQuery.mockResolvedValue([{ live: true }]);
    await expect(hasLiveRun("demo-ext", 5)).resolves.toBe(true);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("live.extension_key = :key");
    expect(options.replacements).toEqual({ key: "demo-ext", orgId: 5 });
  });

  it("returns the newest run of a status kind, or null", async () => {
    mockQuery.mockResolvedValue([{ id: 40 }]);
    await expect(latestStatusRunId("demo-ext", 5)).resolves.toBe(40);
    expect(mockQuery.mock.calls[0][1].replacements).toEqual({
      orgId: 5,
      key: "demo-ext",
      kinds: ["scheduled", "manual"],
    });
    mockQuery.mockResolvedValue([]);
    await expect(latestStatusRunId("demo-ext", 5)).resolves.toBeNull();
  });
});

describe("parseRunsLimit", () => {
  it.each([
    [undefined, 20],
    ["7", 7],
    [" 7 ", 7],
    ["500", 200],
    ["0", 20],
    ["-5", 20],
    ["abc", 20],
    ["7.5", 20],
    [["9", "10"], 9],
    [12, 12],
  ])("parses limit defensively: %p gives %p", (raw, expected) => {
    expect(parseRunsLimit(raw)).toBe(expected);
  });
});

describe("getRunStatus and listRuns", () => {
  it("returns the schedule, liveness, the latest status-kind run and the last finished one", async () => {
    const latest = { id: 41, kind: "manual", status: "skipped", is_live: false };
    const finished = { id: 40, kind: "scheduled", status: "completed", is_live: false };
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes("FROM extension_sync_settings")
        ? [{ enabled: true, interval_hours: 6, consecutive_failures: 2, failing_since: null }]
        : [{ running: false, latest_run: latest, last_finished_run: finished }],
    );

    await expect(getRunStatus("demo-ext", 5)).resolves.toEqual({
      schedule: { enabled: true, interval_hours: 6, consecutive_failures: 2, failing_since: null },
      running: false,
      latest_run: latest,
      last_finished_run: finished,
    });
    const [sql, options] = mockQuery.mock.calls.find(([s]) => String(s).includes("AS latest_run"))!;
    expect(sql).toContain("r.kind IN (:kinds)");
    expect(sql).toContain("AND r.status IN ('completed', 'failed')");
    expect(sql).toContain("ORDER BY r.completed_at DESC, r.id DESC");
    expect(options.replacements).toEqual({
      key: "demo-ext",
      orgId: 5,
      kinds: ["scheduled", "manual"],
    });
  });

  it("lists the org's runs of the extension, newest first, without tokens", async () => {
    mockQuery.mockResolvedValue([{ id: 41 }]);
    await expect(listRuns("demo-ext", 5, 20)).resolves.toEqual([{ id: 41 }]);
    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).not.toContain("run_token");
    expect(sql).toContain("ORDER BY r.started_at DESC, r.id DESC");
    expect(options.replacements).toEqual({ orgId: 5, key: "demo-ext", limit: 20 });
  });
});
