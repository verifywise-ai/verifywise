jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import {
  ClaimedRun,
  claimRun,
  closeStaleRunsForProvider,
  createRunContext,
  recordSkippedRun,
  runClaimed,
  withClaim,
} from "../claim";
import { RunSupersededError, SyncInProgressError } from "../errors";
import { __resetSyncProvidersForTests, registerSyncProvider } from "../registry";
import { ABANDONED_RUN_MESSAGE, SKIPPED_RUN_MESSAGE, SyncProvider } from "../types";

const mockQuery = sequelize.query as jest.Mock;
const mockTransaction = sequelize.transaction as unknown as jest.Mock;
const commitHooks: Array<() => void> = [];
const TX = { id: "tx", afterCommit: (fn: () => void) => commitHooks.push(fn) };
const TOKEN = "00000000-0000-4000-8000-000000000091";
const STARTED_AT = new Date("2026-10-12T10:00:00Z");

const mockRun = jest.fn();
const provider: SyncProvider = {
  key: "demo-ext",
  kinds: ["manual", "scheduled", "import"],
  scheduledKind: "scheduled",
  runDeadlineMs: 1000,
  readiness: async () => ({ ready: true }),
  run: (ctx) => mockRun(ctx),
};
const RUN: ClaimedRun = {
  runId: 91,
  token: TOKEN,
  orgId: 5,
  key: "demo-ext",
  kind: "manual",
  triggeredBy: 8,
};

interface Db {
  live?: Array<{ id: number }>;
  owned?: boolean;
  insertError?: unknown;
  closed?: Array<{ kind: string; started_at: Date }>;
  staleOrgs?: number[];
}

/** Route sequelize.query by SQL text, so tests read as scenarios. */
function fakeDb({ live = [], owned = true, insertError, closed = [], staleOrgs = [] }: Db = {}) {
  mockQuery.mockImplementation(async (sql: string) => {
    if (sql.includes("SELECT DISTINCT r.organization_id")) {
      return staleOrgs.map((organization_id) => ({ organization_id }));
    }
    if (sql.includes("pg_advisory_xact_lock")) return [{}];
    if (sql.includes("SET status = 'abandoned'")) return [closed, {}];
    if (sql.includes("FOR SHARE")) return owned ? [{ id: 91 }] : [];
    if (sql.includes("SELECT id FROM extension_sync_runs")) return live;
    if (sql.includes("'skipped', 'skipped'")) return [[], 1];
    if (sql.includes("INSERT INTO extension_sync_runs")) {
      if (insertError) throw insertError;
      return [[{ id: 91 }], 1];
    }
    if (sql.includes("SET heartbeat_at")) return [owned ? [{ id: 91 }] : [], {}];
    if (sql.includes("SET status = 'completed'")) return [owned ? [{ id: 91 }] : [], {}];
    if (sql.includes("SET status = 'failed'")) {
      return [owned ? [{ started_at: STARTED_AT }] : [], {}];
    }
    return [[], {}];
  });
}

const calls = (fragment: string) =>
  mockQuery.mock.calls.filter(([sql]) => String(sql).includes(fragment));

beforeAll(() => {
  __resetSyncProvidersForTests();
  registerSyncProvider(provider);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery.mockReset();
  mockRun.mockReset();
  commitHooks.length = 0;
  mockTransaction.mockReset();
  mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
    const result = await cb(TX);
    commitHooks.splice(0).forEach((fn) => fn());
    return result;
  });
});

describe("claimRun", () => {
  it("serialises on an advisory lock keyed by extension and org", async () => {
    fakeDb();
    await claimRun("demo-ext", 5, "manual", 8);
    const [lockSql, lock] = calls("pg_advisory_xact_lock")[0];
    expect(lockSql).toContain("hashtext('ext_sync:' || :key)");
    expect(lock.replacements).toEqual({ key: "demo-ext", orgId: 5 });
  });

  it("closes stale started rows as abandoned, deciding staleness in SQL", async () => {
    fakeDb();
    await claimRun("demo-ext", 5, "manual", 8);
    const [sql, options] = calls("SET status = 'abandoned'")[0];
    expect(sql).toContain("code = 'abandoned'");
    expect(sql).toContain("NOT (COALESCE(r.heartbeat_at, r.started_at)");
    expect(options.replacements).toEqual({
      orgId: 5,
      key: "demo-ext",
      message: ABANDONED_RUN_MESSAGE,
    });
    expect(options.transaction).toBe(TX);
  });

  it("inserts a started row with a fresh UUID token", async () => {
    fakeDb();
    const a = await claimRun("demo-ext", 5, "manual", 8);
    const b = await claimRun("demo-ext", 5, "manual", 8);
    expect(a).toMatchObject({
      runId: 91,
      orgId: 5,
      key: "demo-ext",
      kind: "manual",
      triggeredBy: 8,
    });
    expect(a.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(a.token).not.toBe(b.token);
    const [, insert] = calls("INSERT INTO extension_sync_runs")[0];
    expect(insert.replacements).toEqual({
      orgId: 5,
      key: "demo-ext",
      kind: "manual",
      token: a.token,
      triggeredBy: 8,
    });
  });

  it("refuses with SyncInProgressError while a live run remains, inserting nothing", async () => {
    fakeDb({ live: [{ id: 12 }] });
    await expect(claimRun("demo-ext", 5, "manual", 8)).rejects.toBeInstanceOf(SyncInProgressError);
    expect(calls("INSERT INTO extension_sync_runs")).toHaveLength(0);
  });

  it("turns a unique violation on the started index into SyncInProgressError", async () => {
    fakeDb({
      insertError: Object.assign(new Error("dup"), { name: "SequelizeUniqueConstraintError" }),
    });
    await expect(claimRun("demo-ext", 5, "manual", 8)).rejects.toBeInstanceOf(SyncInProgressError);
  });

  it("rejects a kind the provider does not declare, before any SQL", async () => {
    await expect(claimRun("demo-ext", 5, "remove_missing", 8)).rejects.toThrow(
      '"remove_missing" is not a run kind of demo-ext',
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe("RunContext", () => {
  it("heartbeat matches id, org, extension, token and started", async () => {
    fakeDb();
    const ctx = createRunContext(provider, RUN, null);
    await ctx.heartbeat();
    const [sql, options] = calls("SET heartbeat_at")[0];
    expect(sql).toContain("run_token = :token AND status = 'started'");
    expect(options.replacements).toEqual({ runId: 91, orgId: 5, key: "demo-ext", token: TOKEN });
    ctx.dispose();
  });

  it("heartbeat(t) runs inside the caller's transaction, without its own", async () => {
    fakeDb();
    const ctx = createRunContext(provider, RUN, null);
    await ctx.heartbeat(TX as never);
    expect(calls("SET heartbeat_at")[0][1].transaction).toBe(TX);
    expect(mockTransaction).not.toHaveBeenCalled();
    expect(calls("lock_timeout")).toHaveLength(0);
    fakeDb({ owned: false });
    await expect(ctx.heartbeat(TX as never)).rejects.toBeInstanceOf(RunSupersededError);
    ctx.dispose();
  });

  it("heartbeat without a transaction sets a lock timeout in its own short one", async () => {
    fakeDb();
    const ctx = createRunContext(provider, RUN, null);
    await ctx.heartbeat();
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(calls("SET LOCAL lock_timeout")).toHaveLength(1);
    expect(calls("SET LOCAL lock_timeout")[0][1].transaction).toBe(TX);
    expect(calls("SET heartbeat_at")[0][1].transaction).toBe(TX);
    ctx.dispose();
  });

  it("heartbeat surfaces a lock-timeout failure as an error", async () => {
    fakeDb();
    mockQuery.mockImplementation(async (sql: string) => {
      if (sql.includes("SET heartbeat_at"))
        throw new Error("canceling statement due to lock timeout");
      return [[], {}];
    });
    const ctx = createRunContext(provider, RUN, null);
    await expect(ctx.heartbeat()).rejects.toThrow("lock timeout");
    ctx.dispose();
  });

  it("heartbeat throws RunSupersededError once the claim is lost", async () => {
    fakeDb({ owned: false });
    const ctx = createRunContext(provider, RUN, null);
    await expect(ctx.heartbeat()).rejects.toBeInstanceOf(RunSupersededError);
    ctx.dispose();
  });

  it("sqlOwnsRun share-locks this run's own row", () => {
    const ctx = createRunContext(provider, RUN, null);
    const sql = ctx.sqlOwnsRun();
    expect(sql).toContain("own.id = 91");
    expect(sql).toContain(`own.run_token = '${TOKEN}'`);
    expect(sql).toContain("FOR SHARE");
    expect(ctx.sqlOwnsRun("mine")).toContain("mine.id = 91");
    ctx.dispose();
  });

  it("assertOwned share-locks the row inside the caller's transaction", async () => {
    fakeDb();
    const ctx = createRunContext(provider, RUN, null);
    await ctx.assertOwned(TX as never);
    expect(calls("FOR SHARE")[0][1].transaction).toBe(TX);
    fakeDb({ owned: false });
    await expect(ctx.assertOwned(TX as never)).rejects.toBeInstanceOf(RunSupersededError);
    ctx.dispose();
  });

  it("finalize outside a transaction records counts, message and code, then settles", async () => {
    fakeDb();
    const ctx = createRunContext(provider, RUN, null);
    await ctx.finalize({
      counts: { fetched: 3, bad: Number.NaN },
      message: "x".repeat(2500),
      code: "partial",
    });
    const [, options] = calls("SET status = 'completed'")[0];
    expect(JSON.parse(options.replacements.counts)).toEqual({ fetched: 3 });
    expect(options.replacements.message).toHaveLength(2000);
    expect(options.replacements.code).toBe("partial");
    expect(ctx.settled).toBe(true);
    ctx.dispose();
  });

  it("finalize with a lost claim (wrong token) writes nothing and throws", async () => {
    fakeDb({ owned: false });
    const ctx = createRunContext(provider, RUN, null);
    await expect(ctx.finalize({ counts: {} })).rejects.toBeInstanceOf(RunSupersededError);
    expect(ctx.settled).toBe(false);
    ctx.dispose();
  });

  it("finalize inside a transaction settles only when it commits", async () => {
    fakeDb();
    const ctx = createRunContext(provider, RUN, null);
    await ctx.finalize({ counts: {} }, TX as never);
    expect(calls("SET status = 'completed'")[0][1].transaction).toBe(TX);
    expect(ctx.settled).toBe(false);
    commitHooks.splice(0).forEach((fn) => fn());
    expect(ctx.settled).toBe(true);
    ctx.dispose();
  });

  it("release deletes only this started row and never throws outside a transaction", async () => {
    mockQuery.mockRejectedValue(new Error("db down"));
    const ctx = createRunContext(provider, RUN, null);
    await expect(ctx.release()).resolves.toBeUndefined();
    expect(ctx.settled).toBe(false);
    mockQuery.mockReset();
    fakeDb();
    await ctx.release();
    const [sql, options] = calls("DELETE FROM extension_sync_runs")[0];
    expect(sql).toContain("run_token = :token AND status = 'started'");
    expect(options.replacements).toEqual({ runId: 91, orgId: 5, key: "demo-ext", token: TOKEN });
    expect(ctx.settled).toBe(true);
    ctx.dispose();
  });

  it("aborts its signal at the provider's run deadline", () => {
    jest.useFakeTimers();
    try {
      const ctx = createRunContext(provider, RUN, null);
      expect(ctx.signal.aborted).toBe(false);
      jest.advanceTimersByTime(1000);
      expect(ctx.signal.aborted).toBe(true);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe("runClaimed", () => {
  const ctxFor = (kind = "manual") => createRunContext(provider, { ...RUN, kind }, null);

  it("finalizes the result the provider returns", async () => {
    fakeDb();
    mockRun.mockResolvedValue({ counts: { fetched: 2 }, message: "ok" });
    await runClaimed(provider, ctxFor());
    expect(calls("SET status = 'completed'")).toHaveLength(1);
    expect(calls("SET status = 'failed'")).toHaveLength(0);
  });

  it("records a thrown error as failed, truncated, with its code", async () => {
    fakeDb();
    mockRun.mockRejectedValue(Object.assign(new Error("y".repeat(2100)), { code: "ECONNRESET" }));
    await runClaimed(provider, ctxFor());
    const [sql, options] = calls("SET status = 'failed'")[0];
    expect(sql).toContain("run_token = :token AND status = 'started'");
    expect(options.replacements.message).toHaveLength(2000);
    expect(options.replacements.code).toBe("ECONNRESET");
  });

  it("stores a null code when the error has none", async () => {
    fakeDb();
    mockRun.mockRejectedValue(new Error("boom"));
    await runClaimed(provider, ctxFor());
    const [, options] = calls("SET status = 'failed'")[0];
    expect(options.replacements).toMatchObject({ message: "boom", code: null });
  });

  it.each([
    ["a string", "boom", "boom"],
    ["undefined", undefined, "Unknown error"],
    ["an empty Error", new Error(""), "Error"],
    ["null", null, "Unknown error"],
    ["a null-prototype object", Object.create(null), "Unknown error"],
    [
      "an object with a throwing message getter",
      {
        get message(): string {
          throw new Error("getter");
        },
      },
      "Unknown error",
    ],
  ])(
    "closes the run as failed for a thrown non-Error value (%s)",
    async (_label, thrown, expected) => {
      fakeDb();
      mockRun.mockImplementation(async () => {
        throw thrown;
      });
      await runClaimed(provider, ctxFor());
      expect(calls("SET status = 'failed'")[0][1].replacements.message).toBe(expected);
    },
  );

  it("writes nothing when the run was superseded", async () => {
    fakeDb();
    mockRun.mockRejectedValue(new RunSupersededError(91));
    await runClaimed(provider, ctxFor());
    expect(calls("SET status = 'failed'")).toHaveLength(0);
    expect(calls("SET status = 'completed'")).toHaveLength(0);
  });

  it("writes nothing more when the provider finalized itself", async () => {
    fakeDb();
    mockRun.mockImplementation(async (ctx) => {
      await ctx.finalize({ counts: {} });
    });
    await runClaimed(provider, ctxFor());
    expect(calls("SET status = 'completed'")).toHaveLength(1);
    expect(calls("SET status = 'failed'")).toHaveLength(0);
  });

  it("fails a run whose provider returned nothing and did not finalize", async () => {
    fakeDb();
    mockRun.mockResolvedValue(undefined);
    await runClaimed(provider, ctxFor());
    expect(calls("SET status = 'failed'")[0][1].replacements.message).toBe(
      "demo-ext manual run returned no result",
    );
  });

  it("never throws when recording the failure fails", async () => {
    mockRun.mockRejectedValue(new Error("boom"));
    mockQuery.mockRejectedValue(new Error("db down"));
    await expect(runClaimed(provider, ctxFor())).resolves.toBeUndefined();
  });
});

describe("withClaim", () => {
  it("claims, runs fn and finalizes its result", async () => {
    fakeDb();
    const value = await withClaim("demo-ext", 5, "import", 8, async () => ({
      value: 42,
      result: { counts: { created: 1 } },
    }));
    expect(value).toBe(42);
    expect(calls("INSERT INTO extension_sync_runs")[0][1].replacements).toMatchObject({
      kind: "import",
      triggeredBy: 8,
    });
    expect(calls("SET status = 'completed'")).toHaveLength(1);
  });

  it("releases a claim that produced no result", async () => {
    fakeDb();
    await expect(
      withClaim("demo-ext", 5, "import", 8, async () => ({ value: "none" })),
    ).resolves.toBe("none");
    expect(calls("DELETE FROM extension_sync_runs")).toHaveLength(1);
    expect(calls("SET status = 'completed'")).toHaveLength(0);
  });

  it("closes the run as failed and rethrows on an error", async () => {
    fakeDb();
    await expect(
      withClaim("demo-ext", 5, "import", 8, async () => {
        throw new Error("Jira down");
      }),
    ).rejects.toThrow("Jira down");
    expect(calls("SET status = 'failed'")).toHaveLength(1);
  });

  it("releases instead of failing when releaseOn matches", async () => {
    class NothingToDo extends Error {}
    fakeDb();
    await expect(
      withClaim(
        "demo-ext",
        5,
        "import",
        8,
        async () => {
          throw new NothingToDo("none");
        },
        { releaseOn: (err) => err instanceof NothingToDo },
      ),
    ).rejects.toBeInstanceOf(NothingToDo);
    expect(calls("DELETE FROM extension_sync_runs")).toHaveLength(1);
    expect(calls("SET status = 'failed'")).toHaveLength(0);
  });

  it("writes nothing on a superseded run and rethrows", async () => {
    fakeDb();
    await expect(
      withClaim("demo-ext", 5, "import", 8, async () => {
        throw new RunSupersededError(91);
      }),
    ).rejects.toBeInstanceOf(RunSupersededError);
    expect(calls("SET status = 'failed'")).toHaveLength(0);
    expect(calls("DELETE FROM extension_sync_runs")).toHaveLength(0);
  });

  it("leaves a run finalized inside a committed transaction alone", async () => {
    fakeDb();
    const value = await withClaim("demo-ext", 5, "import", 8, async (ctx) => {
      await sequelize.transaction(async (t) => ctx.finalize({ counts: { deleted: 2 } }, t));
      return { value: "done" };
    });
    expect(value).toBe("done");
    expect(calls("SET status = 'completed'")).toHaveLength(1);
    expect(calls("DELETE FROM extension_sync_runs")).toHaveLength(0);
    expect(calls("SET status = 'failed'")).toHaveLength(0);
  });

  it("fails the run when the transaction that finalized it rolled back", async () => {
    fakeDb();
    let n = 0;
    mockTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      n += 1;
      const result = await cb(TX);
      if (n === 2) {
        commitHooks.length = 0;
        throw new Error("commit failed");
      }
      commitHooks.splice(0).forEach((fn) => fn());
      return result;
    });
    await expect(
      withClaim("demo-ext", 5, "import", 8, async (ctx) => {
        await sequelize.transaction(async (t) => ctx.finalize({ counts: {} }, t));
        return { value: 1 };
      }),
    ).rejects.toThrow("commit failed");
    expect(calls("SET status = 'failed'")).toHaveLength(1);
  });
});

describe("recordSkippedRun", () => {
  it("records a closed skipped row with no token", async () => {
    fakeDb();
    await recordSkippedRun("demo-ext", 5, "manual", 8);
    const [sql, options] = calls("INSERT INTO extension_sync_runs")[0];
    expect(sql).toContain("'skipped', 'skipped'");
    expect(sql).not.toContain("run_token");
    expect(options.replacements).toEqual({
      orgId: 5,
      key: "demo-ext",
      kind: "manual",
      triggeredBy: 8,
      message: SKIPPED_RUN_MESSAGE,
    });
  });

  it("never throws", async () => {
    mockQuery.mockRejectedValue(new Error("db down"));
    await expect(recordSkippedRun("demo-ext", 5, "manual", 8)).resolves.toBeUndefined();
  });
});

describe("schedule bookkeeping", () => {
  const streakUps = () => calls("consecutive_failures = consecutive_failures + 1");
  const resets = () => calls("SET consecutive_failures = 0");

  it("counts an abandoned scheduled run as a scheduled failure", async () => {
    fakeDb({
      closed: [
        { kind: "scheduled", started_at: STARTED_AT },
        { kind: "import", started_at: STARTED_AT },
      ],
    });
    await claimRun("demo-ext", 5, "manual", 8);
    expect(streakUps()).toHaveLength(1);
    expect(streakUps()[0][1]).toMatchObject({
      replacements: { key: "demo-ext", orgId: 5, startedAt: STARTED_AT },
      transaction: TX,
    });
  });

  it("the tick's sweep closes each org's stale runs under its lock and counts them", async () => {
    fakeDb({ staleOrgs: [5, 7], closed: [{ kind: "scheduled", started_at: STARTED_AT }] });

    await expect(closeStaleRunsForProvider(provider)).resolves.toEqual([5, 7]);

    const [discoverySql, discovery] = calls("SELECT DISTINCT r.organization_id")[0];
    expect(discoverySql).toContain("r.status = 'started' AND NOT");
    expect(discovery.replacements).toEqual({ key: "demo-ext" });
    expect(calls("pg_advisory_xact_lock").map(([, o]) => o.replacements.orgId)).toEqual([5, 7]);
    expect(streakUps().map(([, o]) => o.replacements.orgId)).toEqual([5, 7]);
    expect(mockTransaction).toHaveBeenCalledTimes(2);
  });

  it("counts a failed scheduled run, not a failed manual one", async () => {
    fakeDb();
    mockRun.mockRejectedValue(new Error("boom"));
    await runClaimed(provider, createRunContext(provider, { ...RUN, kind: "scheduled" }, null));
    expect(streakUps()).toHaveLength(1);
    await runClaimed(provider, createRunContext(provider, RUN, null));
    expect(streakUps()).toHaveLength(1);
  });

  it("resets the streak on a completed manual or scheduled run, not on an import", async () => {
    fakeDb();
    for (const kind of ["manual", "scheduled", "import"]) {
      const ctx = createRunContext(provider, { ...RUN, kind }, null);
      await ctx.finalize({ counts: {} });
      ctx.dispose();
    }
    expect(resets()).toHaveLength(2);
  });

  it("commits the completion and the streak reset together when no transaction is given", async () => {
    fakeDb();
    const ctx = createRunContext(provider, { ...RUN, kind: "scheduled" }, null);
    await ctx.finalize({ counts: {} });
    ctx.dispose();
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(calls("SET status = 'completed'")[0][1].transaction).toBe(TX);
    expect(resets()[0][1].transaction).toBe(TX);
    expect(ctx.settled).toBe(true);
  });
});
