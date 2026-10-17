import {
  ABANDONED_RUN_MESSAGE,
  deleteUseCaseByProjectId,
  IMPORT_MAX_OBJECTS,
  errorMessage,
  getPublicConfig,
  getSyncHistory,
  getSyncStatus,
  getUseCaseByProjectId,
  importObjects,
  JiraConfigValidationError,
  JiraImportInterruptedError,
  JiraNotConfiguredError,
  jiraReadiness,
  JiraUseCaseDeleteFailedError,
  JiraUseCaseNotFoundError,
  parseSyncIntervalHours,
  removeMissingUseCases,
  REMOVAL_SKIP_REASONS,
  runJiraSync,
  saveConfig,
  SKIPPED_RUN_MESSAGE,
  RunSupersededError,
  updateSelection,
  updateSyncSettings,
} from "../jiraAssets.service";
import { jiraAssetsSyncProvider } from "../jiraAssets.syncProvider";
import { createRunContext, runClaimed } from "../../sync-engine/claim";
import { __resetSyncProvidersForTests, registerSyncProvider } from "../../sync-engine/registry";
import { SyncInProgressError } from "../../sync-engine/errors";
import * as engineSchedule from "../../sync-engine/schedule";
import * as engineStatus from "../../sync-engine/status";
import type { RunView } from "../../sync-engine/status";
import { sequelize } from "../../../database/db";
import { decryptText } from "../../../tools/createSecureValue";
import { JiraAssetsClient } from "../jira.client";
import { deleteProjectByIdQuery, lockProjectForDelete } from "../../../utils/project.utils";
import {
  getPendingApprovalRequestIdQuery,
  withdrawApprovalRequestQuery,
} from "../../../utils/approvalRequest.utils";
import { recordUseCaseDeletion } from "../../../utils/useCaseChangeHistory.utils";

// afterCommit runs at once: the mocked transaction always commits.
const FAKE_TX = { id: "tx", afterCommit: (fn: () => void) => fn() };
const TOKEN = "00000000-0000-4000-8000-000000000077";
/** What the run's ownership fragment inlines; present in every guarded write. */
const OWNS = `own.run_token = '${TOKEN}'`;

/** A claimed Jira run, as the engine hands it to the provider. */
const ctxFor = (kind: "manual" | "scheduled" = "manual", triggeredBy: number | null = 8) =>
  createRunContext(
    jiraAssetsSyncProvider,
    { runId: 77, token: TOKEN, orgId: 5, key: "jira-assets", kind, triggeredBy },
    null,
  );

beforeAll(() => {
  __resetSyncProvidersForTests();
  registerSyncProvider(jiraAssetsSyncProvider);
});

jest.mock("../../../database/db", () => ({
  sequelize: {
    query: jest.fn(),
    transaction: jest.fn(),
  },
}));
jest.mock("../../../tools/createSecureValue", () => ({
  encryptText: jest.fn(() => ({ value: "enc", iv: "iv" })),
  decryptText: jest.fn(),
}));
jest.mock("../jira.client", () => {
  class JiraUpstreamError extends Error {}
  return {
    JiraAssetsClient: jest.fn(),
    JiraUpstreamError,
    WORKER_SYNC_DEADLINE_MS: 600_000,
    MAX_PAGES: 500,
    PAGE_SIZE: 50,
  };
});
jest.mock("../../../utils/project.utils", () => ({
  deleteProjectByIdQuery: jest.fn(),
  lockProjectForDelete: jest.fn(async () => true),
}));
jest.mock("../../../utils/approvalRequest.utils", () => ({
  getPendingApprovalRequestIdQuery: jest.fn(),
  withdrawApprovalRequestQuery: jest.fn(),
}));
jest.mock("../../../utils/useCaseChangeHistory.utils", () => ({
  recordUseCaseDeletion: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));

const mockQuery = sequelize.query as jest.Mock;
const mockTransaction = sequelize.transaction as unknown as jest.Mock;
const mockDecrypt = decryptText as jest.Mock;
const MockClient = JiraAssetsClient as unknown as jest.Mock;
const mockDeleteProject = deleteProjectByIdQuery as jest.Mock;
const mockLockProject = lockProjectForDelete as jest.Mock;
const mockPendingApproval = getPendingApprovalRequestIdQuery as jest.Mock;
const mockWithdrawApproval = withdrawApprovalRequestQuery as jest.Mock;
const mockRecordDeletion = recordUseCaseDeletion as jest.Mock;

const CONFIG_ROW = {
  id: 1,
  jira_base_url: "https://x.atlassian.net",
  workspace_id: "w",
  email: "a@b.co",
  api_token_encrypted: "enc",
  api_token_iv: "iv",
  deployment_type: "cloud",
  selected_object_type_id: "42",
};

const jiraObject = (id: string) => ({
  id,
  objectKey: `AI-${id}`,
  label: `System ${id}`,
  objectType: { id: "42", name: "AI System" },
  attributes: [],
  created: "2026-01-01",
  updated: "2026-01-02",
});

const link = (id: string, projectId: number | null, objectTypeId: string | null = "42") => ({
  jira_object_id: id,
  project_id: projectId,
  object_type_id: objectTypeId,
});

interface FakeDb {
  config?: Record<string, unknown> | null;
  existing?: Array<ReturnType<typeof link>>;
  running?: Array<{ id: number }>;
  /** Rows a heartbeat UPDATE affects; [] means this run no longer owns its row. */
  heartbeat?: Array<{ id: number }>;
  /** Rows the in-transaction ownership check (FOR SHARE) finds; [] means the claim was lost. */
  owned?: Array<{ id: number }>;
  /** Project ids that are not in this organization (the project lock finds nothing). */
  foreignProjects?: number[];
  /** Link rows the unlocked pre-check of DELETE /use-cases/:id finds. */
  linkedProject?: Array<{ id: number }>;
  /** Whether the per-object update finds the link row (false: deleted since the walk). */
  linkExists?: boolean;
  /** Rows the run's own finalize UPDATE affects. */
  ownRow?: Array<{ id: number }>;
  /** Rows the missing-flag UPDATE returns (newly flagged). */
  flagged?: Array<{ id: number }>;
  /** Use cases still flagged when a removal locks them. */
  stillFlagged?: Array<{ id: number; project_id: number | null; missing?: boolean }>;
  /** Other links of the same projects (not requested); flagged unless missing: false. */
  otherLinks?: Array<{ id: number; project_id: number | null; missing?: boolean }>;
  live?: boolean;
  latestRunId?: number | null;
}

/** Route sequelize.query by SQL text, so tests read as scenarios, not call orders. */
function fakeDb({
  config = CONFIG_ROW,
  existing = [],
  running = [],
  heartbeat = [{ id: 77 }],
  owned = [{ id: 77 }],
  linkExists = true,
  linkedProject = [{ id: 11 }],
  foreignProjects = [],
  ownRow = [{ id: 77 }],
  flagged = [],
  stillFlagged = [],
  otherLinks = [],
  live = false,
  latestRunId = 40,
}: FakeDb = {}) {
  mockQuery.mockImplementation(async (sql: string, opts: any = {}) => {
    // Guarded writes carry the ownership fragment (FOR SHARE), so match them first.
    if (sql.includes("WITH link AS")) {
      const isOwned = owned.length > 0;
      return [{ owned: isOwned, links: isOwned && linkExists ? 1 : 0 }];
    }
    if (sql.includes("SET missing_in_jira_since = (NOW()")) return [flagged, {}];
    if (sql.includes("FOR SHARE")) return owned;
    if (sql.includes("AS has_use_cases")) {
      return config
        ? [
            {
              has_object_type: !!config.selected_object_type_id,
              has_use_cases: existing.length > 0,
            },
          ]
        : [];
    }
    if (sql.includes("WHERE project_id = :projectId")) return linkedProject;
    if (sql.includes("SELECT id FROM projects")) {
      return (opts.replacements?.projectIds ?? [])
        .filter((id: number) => !foreignProjects.includes(id))
        .map((id: number) => ({ id }));
    }
    if (sql.includes("SET heartbeat_at")) return [heartbeat, {}];
    if (sql.includes("pg_advisory_xact_lock")) return [{}];
    if (sql.includes("SET status = 'abandoned'")) return [[], 0];
    if (sql.includes("ORDER BY started_at DESC, id DESC LIMIT 1")) {
      return latestRunId === null ? [] : [{ id: latestRunId }];
    }
    if (sql.includes("SELECT id FROM extension_sync_runs")) return running;
    if (sql.includes("INSERT INTO extension_sync_runs")) return [[{ id: 77 }], 1];
    if (sql.includes("AS live")) return [{ live }];
    if (sql.includes("SELECT c.id, c.jira_base_url")) return config ? [config] : [];
    if (sql.includes("SELECT * FROM jira_assets_config")) return config ? [config] : [];
    if (sql.includes("SELECT jira_object_id, project_id")) return existing;
    if (sql.includes("SELECT id, project_id, missing_in_jira_since FROM jira_assets_use_cases")) {
      const r = opts.replacements ?? {};
      const match = sql.includes("AND project_id IN (:lockedProjects)")
        ? (row: { project_id: number | null }) =>
            row.project_id !== null && r.lockedProjects.includes(row.project_id)
        : sql.includes("AND project_id IN (:ids)")
          ? (row: { project_id: number | null }) => r.ids.includes(row.project_id)
          : (row: { id: number }) => r.ids.includes(row.id);
      return [...stillFlagged, ...otherLinks]
        .filter((row: any) => match(row))
        .map((row) => ({
          id: row.id,
          project_id: row.project_id,
          missing_in_jira_since: row.missing === false ? null : "2026-01-01",
        }))
        .sort((a, b) => a.id - b.id);
    }
    if (sql.includes("COUNT(DISTINCT project_id)")) {
      const ids: number[] = opts.replacements?.ids ?? [];
      const projects = new Set(
        [...stillFlagged, ...otherLinks].filter((r) => ids.includes(r.id)).map((r) => r.project_id),
      );
      return [{ projects: projects.size }];
    }
    if (sql.includes("SELECT p.project_title")) {
      return [{ title: "Credit model", object_key: "AI-11" }];
    }
    if (sql.includes("SELECT id, project_id FROM jira_assets_use_cases")) {
      return stillFlagged.map((r) => ({ id: r.id, project_id: r.project_id }));
    }
    if (sql.includes("SELECT id FROM jira_assets_use_cases")) return [];
    if (sql.includes("nextval")) return [{ seq: "9" }];
    if (sql.includes("INSERT INTO projects")) return [[{ id: 500 }], 1];
    if (sql.includes("SET status = 'completed'")) return [ownRow, {}];
    if (sql.includes("SET status = 'failed'")) {
      return [ownRow.map(() => ({ started_at: new Date("2026-10-12T10:00:00Z") })), {}];
    }
    if (sql.includes("DELETE FROM jira_assets_use_cases")) {
      return [(opts.replacements?.linkIds ?? []).map((id: number) => ({ id })), {}];
    }
    return [[], {}];
  });
}

const sqlCalls = (fragment: string) =>
  mockQuery.mock.calls.filter(([sql]) => String(sql).includes(fragment));

/** The deletion flow's link reads: [0] unlocked candidates, [1] locked re-check. */
const linkReads = () => sqlCalls("SELECT id, project_id FROM jira_assets_use_cases");

function clientReturning(
  objects: ReturnType<typeof jiraObject>[],
  complete = true,
  stoppedReason?: "deadline",
) {
  const getAllObjects = jest.fn(
    async (_typeId: string, options: { onPage?: () => Promise<void> } = {}) => {
      if (options.onPage) await options.onPage();
      return { objects, complete, stoppedReason };
    },
  );
  MockClient.mockImplementation(() => ({ getAllObjects }));
  return getAllObjects;
}

beforeEach(() => {
  jest.clearAllMocks();
  // mockReset also drops queued *Once values a refused claim leaves unused.
  mockQuery.mockReset();
  mockTransaction.mockReset();
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb(FAKE_TX));
  mockDecrypt.mockReturnValue({ success: true, data: "token" });
  mockDeleteProject.mockResolvedValue(true);
  mockPendingApproval.mockResolvedValue(null);
});

describe("runJiraSync — never deletes, flags missing objects", () => {
  const run = (kind: "manual" | "scheduled" = "manual", triggeredBy: number | null = 8) => {
    const ctx = ctxFor(kind, triggeredBy);
    return runJiraSync(ctx).finally(() => ctx.dispose());
  };

  it("scheduled: updates linked use cases, clears their flag, creates nothing", async () => {
    fakeDb({ existing: [link("1", 101)] });
    clientReturning([jiraObject("1"), jiraObject("3")]);

    const result = await run("scheduled", null);

    expect(result.counts).toMatchObject({ updated: 1, created: 0, deleted: 0 });
    expect(sqlCalls("INSERT INTO projects")).toHaveLength(0);
    expect(sqlCalls("missing_in_jira_since = NULL")).toHaveLength(1);
    expect(sqlCalls("DELETE FROM")).toHaveLength(0);
  });

  it("flags linked objects missing from a complete walk, keeping the earliest date", async () => {
    fakeDb({ existing: [link("1", 101), link("2", 102), link("4", null)], flagged: [{ id: 2 }] });
    clientReturning([jiraObject("1")], true);

    const result = await run();

    expect(result.counts).toMatchObject({ missing: 2, newly_missing: 1, deleted: 0 });
    expect(result.message).toContain("flagged as missing (nothing was removed): 2, 4.");
    const [flagSql, flagOptions] = sqlCalls("SET missing_in_jira_since = (NOW()")[0];
    expect(flagSql).toContain("AND missing_in_jira_since IS NULL");
    expect(flagSql).toContain("data->'objectType'->>'id' = :objectTypeId");
    expect(flagSql).toContain(OWNS);
    expect(flagSql).toContain("FOR SHARE");
    expect(flagOptions.replacements).toEqual({
      organizationId: 5,
      missingIds: ["2", "4"],
      objectTypeId: "42",
    });
    expect(sqlCalls("DELETE FROM")).toHaveLength(0);
  });

  it("never flags links from another object type (type switched A → B)", async () => {
    // Links imported from type "7" (A); the config now walks type "42" (B).
    fakeDb({ existing: [link("a1", 201, "7"), link("a2", 202, "7"), link("b1", 101)] });
    clientReturning([jiraObject("b1")], true);

    const result = await run();

    expect(result.counts.missing).toBe(0);
    expect(sqlCalls("SET missing_in_jira_since = (NOW()")).toHaveLength(0);
    expect(result.message).toContain(
      "2 use case(s) from another or an unknown object type were left as they were",
    );
  });

  it("flags only same-type links when types are mixed; unknown types are left alone", async () => {
    fakeDb({
      existing: [link("1", 101), link("2", 102), link("a1", 201, "7"), link("u1", 301, null)],
      flagged: [{ id: 2 }],
    });
    clientReturning([jiraObject("1")], true);

    const result = await run();

    expect(result.counts.missing).toBe(1);
    expect(sqlCalls("SET missing_in_jira_since = (NOW()")[0][1].replacements.missingIds).toEqual([
      "2",
    ]);
  });

  it("clears a seen object's flag only while the run owns its claim", async () => {
    fakeDb({ existing: [link("1", 101)] });
    clientReturning([jiraObject("1")], true);

    await run();

    const [clearSql] = sqlCalls("missing_in_jira_since = NULL")[0];
    // Once in the link update's WHERE, once in the `owned` column.
    expect(clearSql.split(OWNS)).toHaveLength(3);
    expect(clearSql).toContain("FOR SHARE");
  });

  it("sets no flags after an incomplete walk, but still clears flags for objects it saw", async () => {
    fakeDb({ existing: [link("1", 101), link("2", 102)] });
    clientReturning([jiraObject("1")], false);

    const result = await run();

    expect(sqlCalls("SET missing_in_jira_since = (NOW()")).toHaveLength(0);
    expect(sqlCalls("missing_in_jira_since = NULL")).toHaveLength(1);
    expect(result.message).toContain("did not confirm it returned every object");
  });

  it("sets no flags when Jira returns no objects at all", async () => {
    fakeDb({ existing: [link("1", 101)] });
    clientReturning([], true);

    const result = await run();

    expect(sqlCalls("SET missing_in_jira_since = (NOW()")).toHaveLength(0);
    expect(result.message).toContain("returned no objects");
  });

  it("manual: creates new objects owned by the user, in one owned transaction", async () => {
    fakeDb({ existing: [link("1", 101)] });
    clientReturning([jiraObject("1"), jiraObject("3")], true);

    const result = await run();

    expect(result.counts.created).toBe(1);
    const [, projectInsert] = sqlCalls("INSERT INTO projects")[0];
    expect(projectInsert.replacements.owner).toBe(8);
    expect(projectInsert.transaction).toBe(FAKE_TX);
    expect(sqlCalls("INSERT INTO jira_assets_use_cases")[0][1].transaction).toBe(FAKE_TX);
    expect(sqlCalls("FOR SHARE").some(([, o]) => o?.transaction === FAKE_TX)).toBe(true);
  });

  it("walks Jira under the run's deadline signal and heartbeats per page", async () => {
    fakeDb();
    const getAllObjects = clientReturning([]);
    const ctx = ctxFor();

    await runJiraSync(ctx);

    expect(getAllObjects.mock.calls[0][1].deadline).toBe(ctx.signal);
    expect(sqlCalls("SET heartbeat_at")).toHaveLength(1);
    ctx.dispose();
  });

  it("fails without changing anything when the fetch deadline is hit", async () => {
    fakeDb({ existing: [link("1", 101)] });
    clientReturning([jiraObject("1")], false, "deadline");

    await expect(run()).rejects.toThrow("did not return every object within 10 minutes");
    expect(sqlCalls("UPDATE projects")).toHaveLength(0);
  });

  it("writes nothing more once it has lost its claim mid-way", async () => {
    fakeDb({ existing: [link("1", 101)], heartbeat: [] });
    clientReturning([jiraObject("1")]);

    await expect(run()).rejects.toBeInstanceOf(RunSupersededError);
    expect(sqlCalls("UPDATE projects")).toHaveLength(0);
    expect(sqlCalls("SET status = 'failed'")).toHaveLength(0);
    expect(sqlCalls("UPDATE jira_assets_config")).toHaveLength(0);
  });

  it("updates each linked object in one statement that locks and checks the claim", async () => {
    fakeDb({ existing: [link("1", 101), link("2", 102)] });
    clientReturning([jiraObject("1"), jiraObject("2")]);

    const result = await run();

    expect(result.counts.updated).toBe(2);
    // One round trip per object: no separate ownership query or transaction.
    const updates = sqlCalls("WITH link AS");
    expect(updates).toHaveLength(2);
    // The only transactions are the heartbeats' own (lock_timeout) ones.
    expect(mockTransaction).toHaveBeenCalledTimes(sqlCalls("SET heartbeat_at").length);
    const [sql, options] = updates[0];
    expect(sql).toContain("UPDATE jira_assets_use_cases");
    expect(sql).toContain("UPDATE projects p");
    expect(sql).toContain("FROM link");
    expect(sql).toContain(OWNS);
    expect(options.replacements).toMatchObject({
      jiraObjectId: "1",
      title: "System 1",
      organizationId: 5,
    });
    expect(options.replacements).not.toHaveProperty("historyId");
  });

  it("does not count an object whose link row was deleted since the walk began", async () => {
    fakeDb({ existing: [link("1", 101)], linkExists: false });
    clientReturning([jiraObject("1")]);

    const result = await run();

    expect(result.counts.updated).toBe(0);
  });

  it("stops at the next object, writing nothing, once another claim closed the run", async () => {
    // Heartbeats would still pass here; the per-object check is what stops it.
    fakeDb({ existing: [link("1", 101), link("2", 102)], owned: [] });
    clientReturning([jiraObject("1"), jiraObject("2"), jiraObject("3")]);

    await expect(run()).rejects.toBeInstanceOf(RunSupersededError);
    expect(sqlCalls("WITH link AS")).toHaveLength(1);
    expect(sqlCalls("INSERT INTO projects")).toHaveLength(0);
  });

  it("manual: does not create a use case once the run lost its claim", async () => {
    fakeDb({ existing: [], owned: [] });
    clientReturning([jiraObject("3")]);

    await expect(run()).rejects.toBeInstanceOf(RunSupersededError);
    expect(sqlCalls("nextval")).toHaveLength(0);
    expect(sqlCalls("INSERT INTO projects")).toHaveLength(0);
  });

  it("stops when a heartbeat hits a database error", async () => {
    fakeDb({ existing: [link("1", 101)] });
    clientReturning([jiraObject("1")]);
    const base = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation(async (sql: string, opts: unknown) => {
      if (sql.includes("SET heartbeat_at")) throw new Error("db hiccup");
      return base(sql, opts);
    });

    await expect(run()).rejects.toThrow("db hiccup");
    expect(sqlCalls("UPDATE projects")).toHaveLength(0);
  });

  it("throws a token decrypt failure for the engine to record", async () => {
    fakeDb({ existing: [link("1", 101)] });
    mockDecrypt.mockReturnValue({ success: false, error: "bad key" });

    await expect(run("scheduled", null)).rejects.toThrow("bad key");
  });
});

describe("runJiraSync through the engine", () => {
  it("declares Jira's kinds, its scheduled kind and its walk deadline", () => {
    expect(jiraAssetsSyncProvider).toMatchObject({
      key: "jira-assets",
      displayName: "Jira Assets",
      kinds: ["manual", "scheduled", "import", "remove_missing"],
      scheduledKind: "scheduled",
      runDeadlineMs: 600_000,
    });
  });

  it("records a failure on the run row only, never on the config, and counts it for the schedule", async () => {
    fakeDb({ existing: [link("1", 101)] });
    mockDecrypt.mockReturnValue({ success: false, error: "bad key" });

    await runClaimed(jiraAssetsSyncProvider, ctxFor("scheduled", null));

    const [, failed] = sqlCalls("SET status = 'failed'")[0];
    expect(failed.replacements).toMatchObject({
      runId: 77,
      orgId: 5,
      key: "jira-assets",
      token: TOKEN,
    });
    expect(failed.replacements.message).toContain("bad key");
    expect(sqlCalls("UPDATE jira_assets_config")).toHaveLength(0);
    expect(sqlCalls("consecutive_failures = consecutive_failures + 1")).toHaveLength(1);
  });

  it("finalizes the counts and note of a successful run", async () => {
    fakeDb({ existing: [link("1", 101)] });
    clientReturning([jiraObject("1")], true);

    await runClaimed(jiraAssetsSyncProvider, ctxFor());

    const [, completed] = sqlCalls("SET status = 'completed'")[0];
    expect(JSON.parse(completed.replacements.counts)).toEqual({
      fetched: 1,
      created: 0,
      updated: 1,
      deleted: 0,
      missing: 0,
      newly_missing: 0,
    });
  });
});

describe("jiraReadiness", () => {
  it("manual: 404 without a config, 400 without an object type, no use cases needed", async () => {
    fakeDb({ config: null });
    await expect(jiraReadiness(5, "manual")).resolves.toEqual({
      ready: false,
      status: 404,
      reason: "Jira Assets is not configured. Save the connection first.",
    });
    fakeDb({ config: { ...CONFIG_ROW, selected_object_type_id: null } });
    await expect(jiraReadiness(5, "manual")).resolves.toEqual({
      ready: false,
      status: 400,
      reason: "Select an object type before syncing",
    });
    fakeDb({ existing: [] });
    await expect(jiraReadiness(5, "manual")).resolves.toEqual({ ready: true });
  });

  it("scheduled: not ready without an object type or without use cases", async () => {
    fakeDb({ existing: [] });
    await expect(jiraReadiness(5, "scheduled")).resolves.toMatchObject({
      ready: false,
      reason: "No imported use cases to refresh",
    });
    fakeDb({
      config: { ...CONFIG_ROW, selected_object_type_id: null },
      existing: [link("1", 101)],
    });
    await expect(jiraReadiness(5, "scheduled")).resolves.toMatchObject({
      ready: false,
      reason: "No object type selected for sync",
    });
    fakeDb({ existing: [link("1", 101)] });
    await expect(jiraReadiness(5, "scheduled")).resolves.toEqual({ ready: true });
  });

  it("import needs a config; remove_missing needs nothing", async () => {
    fakeDb({ config: null });
    await expect(jiraReadiness(5, "import")).resolves.toMatchObject({ ready: false, status: 404 });
    await expect(jiraReadiness(5, "remove_missing")).resolves.toEqual({ ready: true });
  });
});

describe("removeMissingUseCases", () => {
  it("validates the id list before claiming", async () => {
    for (const bad of [undefined, [], ["1"], [0], [1.5], new Array(25_001).fill(1)]) {
      await expect(removeMissingUseCases(5, 8, bad)).rejects.toBeInstanceOf(
        JiraConfigValidationError,
      );
    }
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("removes the listed use cases still flagged; reports why the others were skipped", async () => {
    fakeDb({
      stillFlagged: [
        { id: 11, project_id: 111 },
        { id: 12, project_id: null },
        { id: 14, project_id: 114, missing: false },
      ],
    });

    const result = await removeMissingUseCases(5, 8, [11, 12, 13, 14, 13]);

    expect(result).toEqual({
      removed: 1,
      links_removed: 1,
      unlinked: 1,
      skipped: 2,
      skipped_items: [
        { id: 14, reason: "no_longer_missing" },
        { id: 13, reason: "not_found" },
      ],
    });
    const [, insert] = sqlCalls("INSERT INTO extension_sync_runs")[0];
    expect(insert.replacements).toMatchObject({
      key: "jira-assets",
      kind: "remove_missing",
      triggeredBy: 8,
    });
    const [candidateSql, candidates] = linkReads()[0];
    expect(candidateSql).not.toContain("FOR UPDATE");
    expect(candidates.replacements).toEqual({ organizationId: 5, ids: [11, 12, 13, 14] });
    const [requestedSql, requestedLock] = sqlCalls(
      "SELECT id, project_id, missing_in_jira_since",
    )[0];
    const [projectSql, projectLinksLock] = sqlCalls(
      "SELECT id, project_id, missing_in_jira_since",
    )[1];
    expect(requestedSql).toMatch(/AND id IN \(:ids\)\s+ORDER BY id\s+FOR UPDATE/);
    expect(requestedLock.replacements).toEqual({ organizationId: 5, ids: [11, 12, 13, 14] });
    expect(projectSql).toMatch(/project_id IN \(:lockedProjects\)\s+ORDER BY id\s+FOR UPDATE/);
    expect(projectLinksLock.replacements).toEqual({
      organizationId: 5,
      lockedProjects: [111, 114],
    });
    // The run's own row is share-locked first, so no claim can close it mid-way.
    const ownership = sqlCalls("FOR SHARE")[0];
    expect(ownership[1]).toMatchObject({ transaction: FAKE_TX });
    expect(mockQuery.mock.calls.indexOf(ownership)).toBeLessThan(
      mockQuery.mock.calls.indexOf(linkReads()[0]),
    );
    // Projects go through the core deletion path, never a bare DELETE.
    expect(sqlCalls("DELETE FROM projects")).toHaveLength(0);
    expect(mockDeleteProject).toHaveBeenCalledTimes(1);
    expect(mockDeleteProject).toHaveBeenCalledWith(111, 5, FAKE_TX, {
      enqueueAutomationAfterCommit: true,
    });
    expect(mockRecordDeletion).toHaveBeenCalledWith(111, 8, 5, FAKE_TX);
    expect(sqlCalls("DELETE FROM jira_assets_use_cases")[0][1]).toMatchObject({
      replacements: { organizationId: 5, linkIds: [12] },
      transaction: FAKE_TX,
    });
    const [, completed] = sqlCalls("SET status = 'completed'")[0];
    expect(completed).toMatchObject({ transaction: FAKE_TX });
    expect(JSON.parse(completed.replacements.counts)).toMatchObject({ deleted: 1 });
    expect(completed.replacements.message).toContain("1 link(s)");
  });

  it("cannot run while a sync is running", async () => {
    fakeDb({ running: [{ id: 3 }] });

    await expect(removeMissingUseCases(5, 8, [11])).rejects.toBeInstanceOf(SyncInProgressError);
    expect(sqlCalls("DELETE FROM")).toHaveLength(0);
  });

  it("throws (rolling the deletes back) if it lost its claim before finishing", async () => {
    fakeDb({ stillFlagged: [{ id: 11, project_id: 111 }], ownRow: [] });

    await expect(removeMissingUseCases(5, 8, [11])).rejects.toBeInstanceOf(RunSupersededError);
  });

  it("deletes nothing when the claim was already lost when its transaction began", async () => {
    fakeDb({ stillFlagged: [{ id: 11, project_id: 111 }], owned: [] });

    await expect(removeMissingUseCases(5, 8, [11])).rejects.toBeInstanceOf(RunSupersededError);
    expect(mockDeleteProject).not.toHaveBeenCalled();
    expect(sqlCalls("DELETE FROM")).toHaveLength(0);
    expect(sqlCalls("SET status = 'failed'")).toHaveLength(0);
  });

  it("locks projects before link rows, each in id order", async () => {
    fakeDb({
      stillFlagged: [
        { id: 12, project_id: 222 },
        { id: 11, project_id: 111 },
      ],
    });

    await removeMissingUseCases(5, 8, [11, 12]);

    const order = (call: unknown) => mockQuery.mock.calls.indexOf(call as any);
    const candidates = linkReads()[0];
    const projectLock = sqlCalls("SELECT id FROM projects")[0];
    const linkLock = sqlCalls("SELECT id, project_id, missing_in_jira_since")[0];
    expect(sqlCalls("SELECT id FROM projects")).toHaveLength(1);
    expect(projectLock[0]).toMatch(/ORDER BY id\s+FOR UPDATE/);
    expect(projectLock[1].replacements).toEqual({ organizationId: 5, projectIds: [222, 111] });
    expect(order(candidates)).toBeLessThan(order(projectLock));
    expect(order(projectLock)).toBeLessThan(order(linkLock));
    expect(mockDeleteProject.mock.calls.map(([id]) => id)).toEqual([111, 222]);
  });

  it("two flagged links to one project: one use case removed, two links with it", async () => {
    fakeDb({
      stillFlagged: [
        { id: 11, project_id: 111 },
        { id: 12, project_id: 111 },
      ],
    });

    const result = await removeMissingUseCases(5, 8, [11, 12]);

    expect(result).toEqual({
      removed: 1,
      links_removed: 2,
      unlinked: 0,
      skipped: 0,
      skipped_items: [],
    });
    expect(mockDeleteProject).toHaveBeenCalledTimes(1);
    const [, completed] = sqlCalls("SET status = 'completed'")[0];
    expect(JSON.parse(completed.replacements.counts)).toMatchObject({ deleted: 1 });
  });

  it("never deletes a project that still backs a live (unflagged) use case", async () => {
    fakeDb({
      stillFlagged: [{ id: 11, project_id: 111 }],
      otherLinks: [{ id: 30, project_id: 111, missing: false }],
    });

    const result = await removeMissingUseCases(5, 8, [11]);

    expect(result).toMatchObject({
      removed: 0,
      links_removed: 0,
      skipped_items: [{ id: 11, reason: "has_live_links" }],
    });
    expect(mockDeleteProject).not.toHaveBeenCalled();
    expect(sqlCalls("DELETE FROM jira_assets_use_cases")).toHaveLength(0);
  });

  it("tick 50 but not 150 of one project: the project is kept, 50 skipped, 150 untouched", async () => {
    fakeDb({
      stillFlagged: [{ id: 50, project_id: 111 }],
      otherLinks: [{ id: 150, project_id: 111 }],
    });

    const result = await removeMissingUseCases(5, 8, [50]);

    expect(result).toEqual({
      removed: 0,
      links_removed: 0,
      unlinked: 0,
      skipped: 1,
      skipped_items: [{ id: 50, reason: "other_links_not_selected" }],
    });
    expect(mockDeleteProject).not.toHaveBeenCalled();
    expect(mockPendingApproval).not.toHaveBeenCalled();
    expect(sqlCalls("DELETE FROM jira_assets_use_cases")).toHaveLength(0);
  });

  it("tick both 50 and 150 (same request): the project and both links go", async () => {
    fakeDb({
      stillFlagged: [
        { id: 50, project_id: 111 },
        { id: 150, project_id: 111 },
      ],
    });

    const result = await removeMissingUseCases(5, 8, [50, 150]);

    expect(result).toEqual({
      removed: 1,
      links_removed: 2,
      unlinked: 0,
      skipped: 0,
      skipped_items: [],
    });
    expect(mockDeleteProject).toHaveBeenCalledTimes(1);
  });

  it("deletes in the shared order: project lock, approval, history, then the delete", async () => {
    fakeDb({ stillFlagged: [{ id: 11, project_id: 111 }] });
    mockPendingApproval.mockResolvedValue(900);

    await removeMissingUseCases(5, 8, [11]);

    // The batch already locked the project: no extra per-row lock.
    expect(mockLockProject).not.toHaveBeenCalled();
    const projectLock =
      mockQuery.mock.invocationCallOrder[
        mockQuery.mock.calls.indexOf(sqlCalls("SELECT id FROM projects")[0])
      ];
    const approval = mockPendingApproval.mock.invocationCallOrder[0];
    const history = mockRecordDeletion.mock.invocationCallOrder[0];
    const deletion = mockDeleteProject.mock.invocationCallOrder[0];
    expect(projectLock).toBeLessThan(approval);
    expect(approval).toBeLessThan(history);
    expect(history).toBeLessThan(deletion);
  });

  it("reports a link whose project changed during the request as changed", async () => {
    fakeDb({ stillFlagged: [{ id: 11, project_id: 111 }] });
    const base = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation(async (sql: string, opts: any) => {
      // The locked read sees the link pointing at a project not locked before.
      if (sql.includes("SELECT id, project_id, missing_in_jira_since")) {
        return [{ id: 11, project_id: 555, missing_in_jira_since: "2026-01-01" }];
      }
      return base(sql, opts);
    });

    const result = await removeMissingUseCases(5, 8, [11]);

    expect(result.skipped_items).toEqual([{ id: 11, reason: "changed" }]);
    expect(mockDeleteProject).not.toHaveBeenCalled();
    expect(sqlCalls("DELETE FROM jira_assets_use_cases")).toHaveLength(0);
  });

  it("a locked in-org project that fails to delete rolls back with an error naming the use case", async () => {
    fakeDb({ stillFlagged: [{ id: 11, project_id: 111 }] });
    mockDeleteProject.mockResolvedValue(false);

    const err = await removeMissingUseCases(5, 8, [11]).catch((e) => e);

    expect(err).toBeInstanceOf(JiraUseCaseDeleteFailedError);
    expect(err).toMatchObject({ projectId: 111, title: "Credit model", objectKey: "AI-11" });
    // Named by the requested link's title and Jira key, not by internal ids.
    expect(sqlCalls("SELECT p.project_title")[0][1].replacements).toMatchObject({ linkId: 11 });
    expect(err.message).toBe(
      '"Credit model" (AI-11) could not be deleted, so nothing was removed. Try again.',
    );
    expect(err.message).not.toContain("111");
    expect(sqlCalls("DELETE FROM jira_assets_use_cases")).toHaveLength(0);
    expect(sqlCalls("SET status = 'completed'")).toHaveLength(0);
    expect(sqlCalls("SET status = 'failed'")).toHaveLength(1);
  });

  it("cross-org link in a removal: approval untouched, only the link goes (unlinked)", async () => {
    fakeDb({
      stillFlagged: [
        { id: 11, project_id: 111 },
        { id: 12, project_id: 112 },
      ],
      foreignProjects: [112],
    });
    mockPendingApproval.mockImplementation(async (projectId: number) =>
      projectId === 111 ? 900 : 901,
    );

    const result = await removeMissingUseCases(5, 8, [11, 12]);

    expect(result).toMatchObject({ removed: 1, unlinked: 1, skipped: 0 });
    expect(mockPendingApproval).toHaveBeenCalledTimes(1);
    expect(mockPendingApproval).toHaveBeenCalledWith(111, "use_case", 5, FAKE_TX);
    expect(mockWithdrawApproval).toHaveBeenCalledWith(900, 5, FAKE_TX);
    expect(mockDeleteProject).toHaveBeenCalledTimes(1);
    expect(mockRecordDeletion).toHaveBeenCalledTimes(1);
    expect(sqlCalls("DELETE FROM jira_assets_use_cases")[0][1].replacements).toMatchObject({
      linkIds: [12],
    });
  });

  it("rejects more than 25,000 ids before touching the database", async () => {
    const ids = Array.from({ length: 25_001 }, (_, i) => i + 1);

    await expect(removeMissingUseCases(5, 8, ids)).rejects.toBeInstanceOf(
      JiraConfigValidationError,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it(`rejects ids covering more than ${IMPORT_MAX_OBJECTS} use cases, before claiming`, async () => {
    const links = Array.from({ length: IMPORT_MAX_OBJECTS + 1 }, (_, i) => ({
      id: i + 1,
      project_id: 1000 + i,
    }));
    fakeDb({ stillFlagged: links });

    await expect(
      removeMissingUseCases(
        5,
        8,
        links.map((l) => l.id),
      ),
    ).rejects.toBeInstanceOf(JiraConfigValidationError);
    expect(sqlCalls("INSERT INTO extension_sync_runs")).toHaveLength(0);
  });

  it("accepts 1,500 links of one use case in one request (exempt from the id cap)", async () => {
    const links = Array.from({ length: 1500 }, (_, i) => ({ id: i + 1, project_id: 111 }));
    fakeDb({ stillFlagged: links });

    const result = await removeMissingUseCases(
      5,
      8,
      links.map((l) => l.id),
    );

    expect(result).toMatchObject({ removed: 1, links_removed: 1500, skipped: 0 });
  });

  it("rejects more than 1000 ids spread over several use cases", async () => {
    const links = Array.from({ length: 1001 }, (_, i) => ({
      id: i + 1,
      project_id: i < 1000 ? 111 : 222,
    }));
    fakeDb({ stillFlagged: links });

    await expect(
      removeMissingUseCases(
        5,
        8,
        links.map((l) => l.id),
      ),
    ).rejects.toBeInstanceOf(JiraConfigValidationError);
    expect(sqlCalls("INSERT INTO extension_sync_runs")).toHaveLength(0);
  });

  it("re-checks the use-case count under the locks and releases the claim when over", async () => {
    // The unlocked pre-check sees one use case; the locked rows span 101.
    const links = Array.from({ length: IMPORT_MAX_OBJECTS + 1 }, (_, i) => ({
      id: i + 1,
      project_id: 1000 + i,
    }));
    fakeDb({ stillFlagged: links });
    const base = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation(async (sql: string, opts: unknown) => {
      if (sql.includes("COUNT(DISTINCT project_id)")) return [{ projects: 1 }];
      return base(sql, opts);
    });

    await expect(
      removeMissingUseCases(
        5,
        8,
        links.map((l) => l.id),
      ),
    ).rejects.toBeInstanceOf(JiraConfigValidationError);
    expect(mockDeleteProject).not.toHaveBeenCalled();
    expect(sqlCalls("SET status = 'failed'")).toHaveLength(0);
    expect(sqlCalls("DELETE FROM extension_sync_runs")).toHaveLength(1);
  });

  it("accepts more than 100 links when they belong to one use case", async () => {
    const links = Array.from({ length: 150 }, (_, i) => ({ id: i + 1, project_id: 111 }));
    fakeDb({ stillFlagged: links });

    const result = await removeMissingUseCases(
      5,
      8,
      links.map((l) => l.id),
    );

    expect(result).toMatchObject({ removed: 1, links_removed: 150, skipped: 0 });
  });
});

describe("deleteUseCaseByProjectId", () => {
  it("deletes the project with all its links, reporting how many links went", async () => {
    fakeDb({
      stillFlagged: [{ id: 11, project_id: 111 }],
      otherLinks: [{ id: 30, project_id: 111, missing: false }],
    });

    await expect(deleteUseCaseByProjectId(111, 5, 8)).resolves.toEqual({
      unlinked: false,
      links_removed: 2,
    });

    const [, insert] = sqlCalls("INSERT INTO extension_sync_runs")[0];
    expect(insert.replacements).toMatchObject({
      key: "jira-assets",
      kind: "remove_missing",
      triggeredBy: 8,
    });
    // The requested project itself is locked.
    expect(sqlCalls("SELECT id FROM projects")[0][1].replacements).toEqual({
      organizationId: 5,
      projectIds: [111],
    });
    const [lockSql] = sqlCalls("SELECT id, project_id, missing_in_jira_since")[0];
    expect(lockSql).toContain("project_id IN (:ids)");
    expect(mockDeleteProject).toHaveBeenCalledWith(111, 5, FAKE_TX, {
      enqueueAutomationAfterCommit: true,
    });
    expect(mockRecordDeletion).toHaveBeenCalledWith(111, 8, 5, FAKE_TX);
    const [, completed] = sqlCalls("SET status = 'completed'")[0];
    expect(JSON.parse(completed.replacements.counts)).toMatchObject({ deleted: 1 });
  });

  it("finds the use case even if its link appeared after the unlocked read", async () => {
    fakeDb({ stillFlagged: [] });
    const base = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation(async (sql: string, opts: any) => {
      if (sql.includes("SELECT id, project_id, missing_in_jira_since")) {
        return [{ id: 11, project_id: 111, missing_in_jira_since: null }];
      }
      return base(sql, opts);
    });

    await expect(deleteUseCaseByProjectId(111, 5, 8)).resolves.toEqual({
      unlinked: false,
      links_removed: 1,
    });
    expect(mockDeleteProject).toHaveBeenCalledTimes(1);
  });

  it("is 404 for a project that is not a Jira Assets use case, without claiming", async () => {
    fakeDb({ linkedProject: [] });

    await expect(deleteUseCaseByProjectId(111, 5, 8)).rejects.toBeInstanceOf(
      JiraUseCaseNotFoundError,
    );
    expect(sqlCalls("INSERT INTO extension_sync_runs")).toHaveLength(0);
    expect(sqlCalls("pg_advisory_xact_lock")).toHaveLength(0);
  });

  it("is 404, not 409, for a non-linked id while a sync is running", async () => {
    fakeDb({ linkedProject: [], running: [{ id: 3 }] });

    await expect(deleteUseCaseByProjectId(111, 5, 8)).rejects.toBeInstanceOf(
      JiraUseCaseNotFoundError,
    );
    expect(sqlCalls("pg_advisory_xact_lock")).toHaveLength(0);
  });

  it("is 404 with no history row when the link vanished after the pre-check", async () => {
    fakeDb({ stillFlagged: [], foreignProjects: [111] });

    await expect(deleteUseCaseByProjectId(111, 5, 8)).rejects.toBeInstanceOf(
      JiraUseCaseNotFoundError,
    );
    expect(mockDeleteProject).not.toHaveBeenCalled();
    expect(sqlCalls("SET status = 'completed'")).toHaveLength(0);
    expect(sqlCalls("SET status = 'failed'")).toHaveLength(0);
    const [releaseSql, release] = sqlCalls("DELETE FROM extension_sync_runs")[0];
    expect(releaseSql).toContain("run_token = :token AND status = 'started'");
    expect(release.replacements).toMatchObject({ runId: 77, orgId: 5, key: "jira-assets" });
  });

  it("is 409 while a sync, import or removal runs", async () => {
    fakeDb({ running: [{ id: 3 }] });

    await expect(deleteUseCaseByProjectId(111, 5, 8)).rejects.toBeInstanceOf(SyncInProgressError);
    expect(mockDeleteProject).not.toHaveBeenCalled();
  });

  it("a link to another org's project: only the link goes, reported as unlinked", async () => {
    fakeDb({ stillFlagged: [{ id: 11, project_id: 999 }], foreignProjects: [999] });

    await expect(deleteUseCaseByProjectId(999, 5, 8)).resolves.toEqual({
      unlinked: true,
      links_removed: 0,
    });
    expect(mockDeleteProject).not.toHaveBeenCalled();
    expect(mockPendingApproval).not.toHaveBeenCalled();
    expect(mockRecordDeletion).not.toHaveBeenCalled();
    expect(sqlCalls("DELETE FROM jira_assets_use_cases")[0][1].replacements).toMatchObject({
      linkIds: [11],
    });
  });

  it("still closes the run as failed on an unexpected error", async () => {
    fakeDb({ stillFlagged: [{ id: 11, project_id: 111 }] });
    mockDeleteProject.mockRejectedValue(new Error("db down"));

    await expect(deleteUseCaseByProjectId(111, 5, 8)).rejects.toThrow("db down");
    expect(sqlCalls("SET status = 'failed'")).toHaveLength(1);
    expect(sqlCalls("DELETE FROM extension_sync_runs")).toHaveLength(0);
  });
});

describe("errorMessage", () => {
  it.each([
    [undefined, "Unknown error"],
    [null, "Unknown error"],
    ["plain string", "plain string"],
    [{ message: "" }, "[object Object]"],
    [new Error(""), "Error"],
  ])("falls back to a usable message for %p", (err, expected) => {
    expect(errorMessage(err)).toBe(expected);
  });
});

describe("importObjects", () => {
  it(`rejects more than ${IMPORT_MAX_OBJECTS} objects before claiming`, async () => {
    fakeDb();
    const ids = Array.from({ length: IMPORT_MAX_OBJECTS + 1 }, (_, i) => String(i));

    await expect(importObjects(5, 8, ids)).rejects.toBeInstanceOf(JiraConfigValidationError);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("returns the ids of the objects that failed, next to their errors", async () => {
    fakeDb();
    MockClient.mockImplementation(() => ({
      getAttributes: jest.fn(async () => []),
      getObjectById: jest.fn(async (id: string) => {
        if (id === "2") throw new Error("not found");
        return jiraObject(id);
      }),
    }));

    const result = await importObjects(5, 8, ["1", "2", "3"]);

    expect(result).toMatchObject({ imported: 2, skipped: 0, failed_ids: ["2"] });
    expect(result.errors).toEqual(["Failed to import 2: not found"]);
  });

  it("heartbeats while skipping objects that are already linked", async () => {
    fakeDb();
    const base = mockQuery.getMockImplementation()!;
    mockQuery.mockImplementation(async (sql: string, opts: unknown) => {
      if (sql.includes("SELECT id FROM jira_assets_use_cases")) return [{ id: 1 }];
      return base(sql, opts);
    });
    MockClient.mockImplementation(() => ({
      getAttributes: jest.fn(async () => []),
      getObjectById: jest.fn(),
    }));
    const ids = Array.from({ length: 50 }, (_, i) => String(i));

    const result = await importObjects(5, 8, ids);

    expect(result).toMatchObject({ imported: 0, skipped: 50 });
    expect(sqlCalls("SET heartbeat_at")).toHaveLength(2);
  });

  it("stops at once, not as a per-object error, when the claim is lost before a create", async () => {
    fakeDb({ owned: [] });
    MockClient.mockImplementation(() => ({
      getAttributes: jest.fn(async () => []),
      getObjectById: jest.fn(async (id: string) => jiraObject(id)),
    }));

    const err = await importObjects(5, 8, ["1", "2"]).catch((e) => e);

    expect(err).toBeInstanceOf(JiraImportInterruptedError);
    expect(err).toMatchObject({ imported: 0, skipped: 0 });
    expect(sqlCalls("INSERT INTO projects")).toHaveLength(0);
    expect(sqlCalls("FOR SHARE")).toHaveLength(1);
  });

  it("takes the same claim as sync, so it cannot run during a sync", async () => {
    fakeDb({ running: [{ id: 3 }] });

    await expect(importObjects(5, 8, ["1"])).rejects.toBeInstanceOf(SyncInProgressError);
    expect(sqlCalls("INSERT INTO projects")).toHaveLength(0);
    expect(sqlCalls("INSERT INTO extension_sync_runs")).toHaveLength(0);
  });

  it("rejects before claiming when Jira is not configured", async () => {
    fakeDb({ config: null });

    await expect(importObjects(5, 8, ["1"])).rejects.toBeInstanceOf(JiraNotConfiguredError);
    expect(sqlCalls("INSERT INTO extension_sync_runs")).toHaveLength(0);
  });

  it("records an import failure on the history row only, never on the config", async () => {
    fakeDb();
    mockDecrypt.mockReturnValue({ success: false, error: "bad key" });

    await expect(importObjects(5, 8, ["1"])).rejects.toThrow("bad key");
    expect(sqlCalls("SET status = 'failed'")).toHaveLength(1);
    expect(sqlCalls("UPDATE jira_assets_config")).toHaveLength(0);
  });

  it("records the import and counts a unique violation as skipped", async () => {
    fakeDb();
    MockClient.mockImplementation(() => ({
      getAttributes: jest.fn(async () => []),
      getObjectById: jest.fn(async (id: string) => jiraObject(id)),
    }));
    const unique = Object.assign(new Error("duplicate"), {
      name: "SequelizeUniqueConstraintError",
    });
    mockTransaction
      .mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => cb(FAKE_TX)) // claim
      .mockImplementationOnce(async (cb: (tx: unknown) => Promise<unknown>) => cb(FAKE_TX)) // object 1
      .mockImplementationOnce(async () => {
        throw unique; // object 2 was linked concurrently
      });

    const result = await importObjects(5, 8, ["1", "2"]);

    expect(result).toEqual({ success: true, imported: 1, skipped: 1, errors: undefined });
    const [, insert] = sqlCalls("INSERT INTO extension_sync_runs")[0];
    expect(insert.replacements).toMatchObject({
      key: "jira-assets",
      kind: "import",
      triggeredBy: 8,
    });
  });

  it("reports how many objects were imported when another run took over", async () => {
    fakeDb({ ownRow: [] });
    MockClient.mockImplementation(() => ({
      getAttributes: jest.fn(async () => []),
      getObjectById: jest.fn(async (id: string) => jiraObject(id)),
    }));

    const err = await importObjects(5, 8, ["1", "2"]).catch((e) => e);

    expect(err).toBeInstanceOf(JiraImportInterruptedError);
    expect(err).toMatchObject({ imported: 2, skipped: 0 });
  });
});

const runView = (over: Partial<RunView> = {}): RunView => ({
  id: 41,
  kind: "manual",
  status: "completed",
  code: null,
  counts: { fetched: 3, created: 1, updated: 2, deleted: 0 },
  message: null,
  started_at: "2026-10-12T10:00:00.000+00:00",
  completed_at: "2026-10-12T10:01:00.000+00:00",
  is_live: false,
  ...over,
});

describe("legacy GET /sync/status (getSyncStatus)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("is null when Jira is not configured", async () => {
    fakeDb({ config: null });
    const spy = jest.spyOn(engineStatus, "getRunStatus");

    await expect(getSyncStatus(5)).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it("keeps the old shape, with an abandoned run as a failed row coded abandoned", async () => {
    fakeDb({ config: { ...CONFIG_ROW, sync_enabled: true, sync_interval_hours: 6 } });
    jest.spyOn(engineStatus, "getRunStatus").mockResolvedValue({
      schedule: null,
      running: false,
      last_finished_run: null,
      latest_run: runView({
        status: "abandoned",
        code: "abandoned",
        message: ABANDONED_RUN_MESSAGE,
      }),
    });

    const status = await getSyncStatus(5);

    expect(Object.keys(status!).sort()).toEqual([
      "last_sync_at",
      "last_sync_message",
      "last_sync_status",
      "latest_run",
      "running",
      "sync_enabled",
      "sync_interval_hours",
    ]);
    expect(status!.latest_run).toEqual({
      id: 41,
      sync_type: "manual",
      status: "failed",
      objects_fetched: 3,
      objects_created: 1,
      objects_updated: 2,
      error_message: ABANDONED_RUN_MESSAGE,
      started_at: "2026-10-12T10:00:00.000+00:00",
      completed_at: "2026-10-12T10:01:00.000+00:00",
      is_live: false,
      code: "abandoned",
    });
    expect(status).toMatchObject({ sync_enabled: true, sync_interval_hours: 6, running: false });
    expect(engineStatus.getRunStatus).toHaveBeenCalledWith("jira-assets", 5);
  });

  it("reports a skipped run as a failed row coded skipped, and a completed one uncoded", async () => {
    fakeDb();
    const spy = jest.spyOn(engineStatus, "getRunStatus");
    spy.mockResolvedValueOnce({
      schedule: null,
      running: false,
      last_finished_run: null,
      latest_run: runView({
        status: "skipped",
        code: "skipped",
        message: SKIPPED_RUN_MESSAGE,
        counts: {},
      }),
    });
    expect((await getSyncStatus(5))!.latest_run).toMatchObject({
      status: "failed",
      code: "skipped",
      error_message: SKIPPED_RUN_MESSAGE,
      objects_fetched: 0,
    });

    spy.mockResolvedValueOnce({
      schedule: null,
      running: true,
      last_finished_run: null,
      latest_run: runView(),
    });
    expect((await getSyncStatus(5))!.latest_run).toMatchObject({ status: "completed", code: null });
  });
});

describe("legacy GET /sync/history (getSyncHistory)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("returns rows in the old SELECT * shape, with no token", async () => {
    const at = new Date("2026-10-12T10:00:00Z");
    jest.spyOn(engineStatus, "listRuns").mockResolvedValue([
      {
        id: 42,
        kind: "remove_missing",
        status: "completed",
        code: null,
        counts: { deleted: 2 },
        message: null,
        triggered_by: 8,
        started_at: at,
        heartbeat_at: at,
        completed_at: at,
      },
      {
        id: 41,
        kind: "manual",
        status: "skipped",
        code: "skipped",
        counts: {},
        message: SKIPPED_RUN_MESSAGE,
        triggered_by: 8,
        started_at: at,
        heartbeat_at: null,
        completed_at: at,
      },
    ]);

    const rows = await getSyncHistory(5, 20);

    expect(engineStatus.listRuns).toHaveBeenCalledWith("jira-assets", 5, 20);
    expect(Object.keys(rows[0]).sort()).toEqual([
      "completed_at",
      "error_message",
      "heartbeat_at",
      "id",
      "objects_created",
      "objects_deleted",
      "objects_fetched",
      "objects_updated",
      "organization_id",
      "run_token",
      "started_at",
      "status",
      "sync_type",
      "triggered_by",
    ]);
    expect(rows[0]).toMatchObject({
      organization_id: 5,
      sync_type: "remove_missing",
      status: "completed",
      objects_deleted: 2,
      run_token: null,
    });
    expect(rows[1]).toMatchObject({ status: "failed", error_message: SKIPPED_RUN_MESSAGE });
  });
});

describe("GET /config last_sync_* (getPublicConfig)", () => {
  it("derives the schedule and last_sync_* from the engine", async () => {
    mockQuery.mockResolvedValue([{ id: 1 }]);

    await getPublicConfig(5);

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).toContain("LEFT JOIN extension_sync_settings s");
    expect(sql).toContain("COALESCE(s.enabled, FALSE) AS sync_enabled");
    expect(sql).toContain(
      "r.kind IN ('manual', 'scheduled') AND r.status IN ('completed', 'failed')",
    );
    expect(sql).toContain("ORDER BY r.completed_at DESC, r.id DESC");
    expect(sql).toContain("WHEN 'completed' THEN 'success'");
    expect(sql).not.toMatch(/c\.last_sync_|c\.sync_enabled|c\.sync_interval_hours/);
    expect(options.replacements).toEqual({
      organizationId: 5,
      key: "jira-assets",
      defaultInterval: 24,
    });
  });
});

describe("legacy PATCH /config/sync (updateSyncSettings)", () => {
  afterEach(() => jest.restoreAllMocks());

  it("saves the fields sent in the engine schedule and answers in the old shape", async () => {
    fakeDb();
    const save = jest.spyOn(engineSchedule, "saveSchedule").mockResolvedValue({
      enabled: true,
      interval_hours: 24,
      consecutive_failures: 0,
      failing_since: null,
    });

    await expect(updateSyncSettings(5, 8, { sync_enabled: true })).resolves.toEqual({
      sync_enabled: true,
      sync_interval_hours: 24,
    });
    expect(save).toHaveBeenCalledWith(
      "jira-assets",
      5,
      { enabled: true, intervalHours: undefined },
      { userId: 8 },
    );
    expect(sqlCalls("UPDATE jira_assets_config")).toHaveLength(0);
  });

  it("validates the input before touching the database", async () => {
    await expect(updateSyncSettings(5, 8, { sync_interval_hours: 0 })).rejects.toBeInstanceOf(
      JiraConfigValidationError,
    );
    await expect(updateSyncSettings(5, 8, {})).rejects.toBeInstanceOf(JiraConfigValidationError);
    await expect(updateSyncSettings(5, 8, { sync_enabled: "on" })).rejects.toBeInstanceOf(
      JiraConfigValidationError,
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("reports a missing config instead of creating a schedule", async () => {
    fakeDb({ config: null });
    const save = jest.spyOn(engineSchedule, "saveSchedule");

    await expect(updateSyncSettings(5, 8, { sync_interval_hours: 6 })).rejects.toBeInstanceOf(
      JiraNotConfiguredError,
    );
    expect(save).not.toHaveBeenCalled();
  });
});

describe("updateSelection (partial patch)", () => {
  it("changes only the selection fields that were sent, clearing on null", async () => {
    mockQuery.mockResolvedValue([[{ selected_schema_id: "3", selected_object_type_id: null }], 1]);

    await updateSelection(5, 8, { selected_schema_id: "3", selected_object_type_id: null });

    const [sql, options] = mockQuery.mock.calls[0];
    expect(sql).not.toMatch(/sync_enabled|sync_interval|jira_base_url|api_token|email/);
    expect(options.replacements).toEqual({
      setSchema: true,
      schemaId: "3",
      setObjectType: true,
      objectTypeId: null,
      userId: 8,
      organizationId: 5,
    });
  });

  it("leaves a field that was not sent unchanged", async () => {
    mockQuery.mockResolvedValue([[{ selected_schema_id: "3", selected_object_type_id: "42" }], 1]);

    await updateSelection(5, 8, { selected_object_type_id: 42 });

    expect(mockQuery.mock.calls[0][1].replacements).toMatchObject({
      setSchema: false,
      setObjectType: true,
      objectTypeId: "42",
    });
  });

  it("rejects bad ids and empty bodies, and reports a missing config", async () => {
    await expect(updateSelection(5, 8, {})).rejects.toBeInstanceOf(JiraConfigValidationError);
    await expect(
      updateSelection(5, 8, { selected_object_type_id: "1; DROP TABLE x" }),
    ).rejects.toBeInstanceOf(JiraConfigValidationError);
    mockQuery.mockResolvedValue([[], 0]);
    await expect(updateSelection(5, 8, { selected_schema_id: "3" })).rejects.toBeInstanceOf(
      JiraNotConfiguredError,
    );
  });
});

describe("parseSyncIntervalHours", () => {
  it("defaults to 24 when missing", () => {
    expect(parseSyncIntervalHours(undefined)).toBe(24);
    expect(parseSyncIntervalHours(null)).toBe(24);
    expect(parseSyncIntervalHours("")).toBe(24);
  });

  it("accepts whole hours from 1 to 168, as numbers or numeric strings", () => {
    expect(parseSyncIntervalHours(1)).toBe(1);
    expect(parseSyncIntervalHours(168)).toBe(168);
    expect(parseSyncIntervalHours("6")).toBe(6);
  });

  it.each([0, 169, -5, 1.5, "abc", "12h", true, {}])("rejects %p", (raw) => {
    expect(() => parseSyncIntervalHours(raw)).toThrow(JiraConfigValidationError);
  });
});

describe("saveConfig validation", () => {
  const base = {
    jira_base_url: "https://x.atlassian.net",
    workspace_id: "w",
    email: "a@b.co",
  };

  it("rejects an out-of-range interval before writing", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, api_token_encrypted: "enc" }]);

    await expect(saveConfig(5, 3, { ...base, sync_interval_hours: 500 })).rejects.toBeInstanceOf(
      JiraConfigValidationError,
    );
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("writes the connection without sync columns and the schedule through the engine", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, api_token_encrypted: "enc" }]).mockResolvedValue([]);
    const save = jest.spyOn(engineSchedule, "saveSchedule").mockResolvedValue({
      enabled: true,
      interval_hours: 6,
      consecutive_failures: 0,
      failing_since: null,
    });

    await saveConfig(5, 3, { ...base, sync_enabled: true, sync_interval_hours: 6 });

    const [updateSql, update] = mockQuery.mock.calls[1];
    expect(updateSql).not.toContain("sync_enabled");
    expect(update.replacements).not.toHaveProperty("syncEnabled");
    // The schedule is saved in the same transaction as the connection, as user 3.
    expect(update.transaction).toBeDefined();
    expect(save).toHaveBeenCalledWith(
      "jira-assets",
      5,
      { enabled: true, intervalHours: 6 },
      { userId: 3, transaction: update.transaction },
    );
    save.mockRestore();
  });

  it("saves only the sync field the body carries, keeping the other", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, api_token_encrypted: "enc" }]).mockResolvedValue([]);
    const save = jest.spyOn(engineSchedule, "saveSchedule").mockResolvedValue({
      enabled: true,
      interval_hours: 6,
      consecutive_failures: 0,
      failing_since: null,
    });

    await saveConfig(5, 3, { ...base, sync_interval_hours: 6 });
    expect(save).toHaveBeenLastCalledWith(
      "jira-assets",
      5,
      { enabled: undefined, intervalHours: 6 },
      expect.objectContaining({ userId: 3 }),
    );

    mockQuery.mockResolvedValueOnce([{ id: 1, api_token_encrypted: "enc" }]);
    await saveConfig(5, 3, { ...base, sync_enabled: true });
    expect(save).toHaveBeenLastCalledWith(
      "jira-assets",
      5,
      { enabled: true, intervalHours: undefined },
      expect.objectContaining({ userId: 3 }),
    );
    save.mockRestore();
  });

  it("leaves the schedule alone when the body has no sync fields", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 1, api_token_encrypted: "enc" }]).mockResolvedValue([]);
    const save = jest.spyOn(engineSchedule, "saveSchedule");

    await saveConfig(5, 3, base);

    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
  });
});

describe("removal skip reasons", () => {
  it("are the ones documented in swagger.yaml and extensions.md", () => {
    const fs = jest.requireActual("fs") as typeof import("fs");
    const path = jest.requireActual("path") as typeof import("path");
    const root = path.resolve(__dirname, "../../../..");
    const swagger = fs.readFileSync(path.join(root, "Servers/swagger.yaml"), "utf8");
    const docs = fs.readFileSync(
      path.join(root, "docs/technical/infrastructure/extensions.md"),
      "utf8",
    );

    expect([...REMOVAL_SKIP_REASONS]).toEqual([
      "no_longer_missing",
      "not_found",
      "changed",
      "has_live_links",
      "other_links_not_selected",
    ]);
    for (const reason of REMOVAL_SKIP_REASONS) {
      expect(swagger).toContain(reason);
      expect(docs).toContain(`\`${reason}\``);
    }
  });
});

describe("getUseCaseByProjectId", () => {
  it("returns the native use case's roles and the derived single role", async () => {
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM jira_assets_use_cases"))
        return [{ id: 4, project_id: 50, uc_id: "UC-50", data: "{}" }];
      if (String(sql).includes("SELECT * FROM projects"))
        return [{ id: 50, project_title: "P", high_risk_roles: ["Deployer", "Provider"] }];
      return [];
    });
    const useCase = await getUseCaseByProjectId(50, 1);
    expect(useCase?.high_risk_roles).toEqual(["Provider", "Deployer"]);
    expect(useCase?.type_of_high_risk_role).toBe("Provider");
  });
});
