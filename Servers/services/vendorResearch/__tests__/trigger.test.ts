jest.mock("../config", () => ({ getVendorResearchConfig: jest.fn() }));
jest.mock("../../../utils/vendor.utils", () => ({ getVendorByIdQuery: jest.fn() }));
jest.mock("../../../utils/llmKey.utils", () => ({ getLLMKeysQuery: jest.fn() }));
jest.mock("../../../utils/vendorResearch.utils", () => ({
  STALE_RUN_MINUTES: 15,
  countRunsSinceQuery: jest.fn(),
  createRunQuery: jest.fn(),
  failStaleRunsQuery: jest.fn(),
  finishRunQuery: jest.fn(),
  getActiveRunQuery: jest.fn(),
  getLastRunCreatedAtQuery: jest.fn(),
}));
// The real module opens a BullMQ queue as soon as it is imported.
jest.mock("../queue", () => ({ enqueueVendorResearch: jest.fn() }));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { IVendor } from "../../../domain.layer/interfaces/i.vendor";
import {
  IVendorResearchRun,
  ResearchTrigger,
} from "../../../domain.layer/interfaces/i.vendorResearch";
import { getLLMKeysQuery } from "../../../utils/llmKey.utils";
import logger from "../../../utils/logger/fileLogger";
import { getVendorByIdQuery } from "../../../utils/vendor.utils";
import {
  countRunsSinceQuery,
  createRunQuery,
  failStaleRunsQuery,
  finishRunQuery,
  getActiveRunQuery,
  getLastRunCreatedAtQuery,
} from "../../../utils/vendorResearch.utils";
import { enqueueVendorResearch } from "../queue";
import { VendorResearchConfig, getVendorResearchConfig } from "../config";
import {
  ENQUEUE_TIMEOUT_MS,
  StartResearchResult,
  startVendorResearch,
  triggerAutoResearch,
} from "../trigger";

type AnyMock = jest.Mock<any, any[]>;
const asMock = (fn: unknown): AnyMock => fn as AnyMock;

// Three different numbers, so that a swapped pair of arguments shows up as a failure.
const ORG = 3;
const VENDOR = 7;
const RUN_ID = 11;
const REQUESTER = 5;

// A date years away from the real one, so that a trigger that read the system clock instead of
// the faked one would notice.
const NOW = new Date("2031-04-20T12:00:00Z");
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

const CONFIGURED: VendorResearchConfig = {
  autoRun: true,
  manualCooldownMinutes: 10,
  dailyRunCap: 50,
  workerConcurrency: 5,
  headless: false,
  records: true,
};

const VENDOR_ROW = { id: VENDOR, vendor_name: "Acme" } as IVendor;

const makeRun = (overrides: Partial<IVendorResearchRun> = {}): IVendorResearchRun => ({
  id: RUN_ID,
  organization_id: ORG,
  vendor_id: VENDOR,
  trigger_type: "manual",
  status: "queued",
  categories: [],
  category_summary: [],
  evidence: null,
  model: null,
  prompt_version: null,
  searches_used: 0,
  pages_read: 0,
  duplicates_dropped: 0,
  error: null,
  progress: null,
  requested_by: REQUESTER,
  coverage: null,
  registry_version: null,
  created_at: NOW,
  started_at: null,
  finished_at: null,
  ...overrides,
});

const start = (overrides: { triggerType?: ResearchTrigger; requestedBy?: number | null } = {}) =>
  startVendorResearch({
    organizationId: ORG,
    vendorId: VENDOR,
    triggerType: "manual",
    requestedBy: REQUESTER,
    ...overrides,
  });

const autoArgs = { organizationId: ORG, vendorId: VENDOR, isDemo: false };

/** Every line that went through the logger, whatever the level. */
const loggedLines = (): string[] =>
  (["debug", "info", "warn", "error"] as const).flatMap((level) =>
    asMock(logger[level]).mock.calls.map((args) => args.map(String).join(" ")),
  );

const callOrder = (fn: unknown): number => asMock(fn).mock.invocationCallOrder[0];

/** The queries and calls that create or queue a run. */
const expectNothingStarted = () => {
  expect(createRunQuery).not.toHaveBeenCalled();
  expect(enqueueVendorResearch).not.toHaveBeenCalled();
};

beforeEach(() => {
  jest.resetAllMocks();
  jest.useFakeTimers().setSystemTime(NOW);
  // The happy path: a vendor that exists, a key, no earlier run, room under the cap.
  asMock(getVendorByIdQuery).mockResolvedValue(VENDOR_ROW);
  asMock(getVendorResearchConfig).mockReturnValue(CONFIGURED);
  asMock(getLLMKeysQuery).mockResolvedValue([{ id: 1 }]);
  asMock(failStaleRunsQuery).mockResolvedValue(0);
  asMock(getActiveRunQuery).mockResolvedValue(null);
  asMock(getLastRunCreatedAtQuery).mockResolvedValue(null);
  asMock(countRunsSinceQuery).mockResolvedValue(0);
  asMock(createRunQuery).mockResolvedValue(makeRun());
  asMock(enqueueVendorResearch).mockResolvedValue(undefined);
  asMock(finishRunQuery).mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
  // Search is no setting of the install any more, so no line may say it is not configured.
  for (const line of loggedLines()) expect(line).not.toMatch(/search(_| is )not[_ ]configured/i);
});

describe("startVendorResearch", () => {
  describe("what has to be true before anything is created", () => {
    it("looks the vendor up in the organization first, and stops when it is not there", async () => {
      asMock(getVendorByIdQuery).mockResolvedValue(null);
      asMock(getLLMKeysQuery).mockResolvedValue([]);

      await expect(start()).resolves.toEqual({ ok: false, error: { code: "vendor_not_found" } });

      expect(getVendorByIdQuery).toHaveBeenCalledWith(VENDOR, ORG);
      // Even a missing LLM key does not come first: the vendor is checked before it.
      expect(getLLMKeysQuery).not.toHaveBeenCalled();
      expect(failStaleRunsQuery).not.toHaveBeenCalled();
      expectNothingStarted();
    });

    it("stops a manual start when the organization has no LLM key, and asks nothing else", async () => {
      asMock(getLLMKeysQuery).mockResolvedValue([]);

      await expect(start({ triggerType: "manual" })).resolves.toEqual({
        ok: false,
        error: { code: "llm_key_missing" },
      });

      expect(getLLMKeysQuery).toHaveBeenCalledWith(ORG);
      expect(failStaleRunsQuery).not.toHaveBeenCalled();
      expect(getActiveRunQuery).not.toHaveBeenCalled();
      expect(getLastRunCreatedAtQuery).not.toHaveBeenCalled();
      expect(countRunsSinceQuery).not.toHaveBeenCalled();
      expectNothingStarted();
    });

    it("checks the vendor, the key, the stale runs and the active run, the cooldown, the cap, then creates and queues", async () => {
      await expect(start({ triggerType: "manual" })).resolves.toMatchObject({ ok: true });

      const inOrder = [
        getVendorByIdQuery,
        getLLMKeysQuery,
        failStaleRunsQuery,
        getActiveRunQuery,
        getLastRunCreatedAtQuery,
        countRunsSinceQuery,
        createRunQuery,
        enqueueVendorResearch,
      ].map(callOrder);
      expect(inOrder.every((order) => order !== undefined)).toBe(true);
      expect(inOrder).toEqual([...inOrder].sort((a, b) => a - b));
    });
  });

  describe("runs that are already there", () => {
    it("fails the vendor's stale runs, those older than 15 minutes, before it looks for an active one", async () => {
      await start();

      expect(failStaleRunsQuery).toHaveBeenCalledWith(ORG, VENDOR, 15);
      expect(getActiveRunQuery).toHaveBeenCalledWith(ORG, VENDOR);
      expect(callOrder(failStaleRunsQuery)).toBeLessThan(callOrder(getActiveRunQuery));
    });

    it("returns the active run instead of starting another, even inside the cooldown", async () => {
      const active = makeRun({ id: 99, status: "running" });
      asMock(getActiveRunQuery).mockResolvedValue(active);
      // The vendor's last run is three minutes old, and a manual start has to wait ten.
      asMock(getLastRunCreatedAtQuery).mockResolvedValue(new Date(NOW.getTime() - 3 * MINUTE_MS));

      await expect(start()).resolves.toEqual({ ok: true, run: active, alreadyRunning: true });

      expectNothingStarted();
    });
  });

  describe("the cooldown of a manual start", () => {
    it("refuses a manual start while the cooldown runs, and says how long to wait", async () => {
      // 3 minutes and 0.6 seconds ago: 419.4 seconds are left, which is 420 rounded up.
      asMock(getLastRunCreatedAtQuery).mockResolvedValue(
        new Date(NOW.getTime() - 3 * MINUTE_MS - 600),
      );

      await expect(start({ triggerType: "manual" })).resolves.toEqual({
        ok: false,
        error: { code: "cooldown", retryAfterSeconds: 420 },
      });

      expect(getLastRunCreatedAtQuery).toHaveBeenCalledWith(ORG, VENDOR);
      expect(countRunsSinceQuery).not.toHaveBeenCalled();
      expectNothingStarted();
    });

    it("starts a manual run once the cooldown has passed", async () => {
      asMock(getLastRunCreatedAtQuery).mockResolvedValue(new Date(NOW.getTime() - 10 * MINUTE_MS));

      await expect(start({ triggerType: "manual" })).resolves.toMatchObject({ ok: true });
    });

    it("does not make an automatic start wait", async () => {
      asMock(getLastRunCreatedAtQuery).mockResolvedValue(new Date(NOW.getTime() - 3 * MINUTE_MS));

      await expect(start({ triggerType: "auto", requestedBy: null })).resolves.toMatchObject({
        ok: true,
        alreadyRunning: false,
      });

      expect(getLastRunCreatedAtQuery).not.toHaveBeenCalled();
    });

    it("does not look at the last run when the cooldown is set to zero", async () => {
      asMock(getVendorResearchConfig).mockReturnValue({ ...CONFIGURED, manualCooldownMinutes: 0 });
      // A last run in the future, as a database clock that is ahead of ours would give.
      asMock(getLastRunCreatedAtQuery).mockResolvedValue(new Date(NOW.getTime() + 5000));

      await expect(start({ triggerType: "manual" })).resolves.toMatchObject({ ok: true });

      expect(getLastRunCreatedAtQuery).not.toHaveBeenCalled();
    });
  });

  describe("the daily cap", () => {
    it("refuses a start when the organization has used the cap in the last 24 hours", async () => {
      asMock(countRunsSinceQuery).mockResolvedValue(50);

      await expect(start()).resolves.toEqual({ ok: false, error: { code: "daily_cap" } });

      expect(countRunsSinceQuery).toHaveBeenCalledWith(ORG, new Date(NOW.getTime() - DAY_MS));
      expectNothingStarted();
    });

    it("starts a run when the count is below the cap", async () => {
      asMock(countRunsSinceQuery).mockResolvedValue(49);

      await expect(start()).resolves.toMatchObject({ ok: true, alreadyRunning: false });
    });

    it("applies the cap of the configuration", async () => {
      asMock(getVendorResearchConfig).mockReturnValue({ ...CONFIGURED, dailyRunCap: 3 });
      asMock(countRunsSinceQuery).mockResolvedValue(3);

      await expect(start()).resolves.toEqual({ ok: false, error: { code: "daily_cap" } });
    });
  });

  describe("creating and queueing the run", () => {
    it("creates a queued run for the requester and then queues the job for that run", async () => {
      const created = makeRun({ id: 42 });
      asMock(createRunQuery).mockResolvedValue(created);

      await expect(start({ triggerType: "manual", requestedBy: REQUESTER })).resolves.toEqual({
        ok: true,
        run: created,
        alreadyRunning: false,
      });

      expect(createRunQuery).toHaveBeenCalledWith({
        organizationId: ORG,
        vendorId: VENDOR,
        triggerType: "manual",
        requestedBy: REQUESTER,
      });
      expect(enqueueVendorResearch).toHaveBeenCalledWith(ORG, VENDOR, 42);
      expect(callOrder(createRunQuery)).toBeLessThan(callOrder(enqueueVendorResearch));
      expect(finishRunQuery).not.toHaveBeenCalled();
    });

    it("returns the active run when another start created one first (the unique index)", async () => {
      const winner = makeRun({ id: 77, status: "queued" });
      asMock(getActiveRunQuery).mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
      asMock(createRunQuery).mockRejectedValue(
        Object.assign(new Error("duplicate key"), { parent: { code: "23505" } }),
      );

      await expect(start()).resolves.toEqual({ ok: true, run: winner, alreadyRunning: true });

      expect(getActiveRunQuery).toHaveBeenCalledTimes(2);
      expect(enqueueVendorResearch).not.toHaveBeenCalled();
    });

    it("rethrows the unique violation when no active run is there to return", async () => {
      const violation = Object.assign(new Error("duplicate key"), { parent: { code: "23505" } });
      asMock(createRunQuery).mockRejectedValue(violation);

      await expect(start()).rejects.toBe(violation);

      expect(enqueueVendorResearch).not.toHaveBeenCalled();
    });

    it("rethrows any other error of the insert", async () => {
      const failure = Object.assign(new Error("connection lost"), { parent: { code: "08006" } });
      asMock(createRunQuery).mockRejectedValue(failure);

      await expect(start()).rejects.toBe(failure);

      expect(getActiveRunQuery).toHaveBeenCalledTimes(1);
      expect(enqueueVendorResearch).not.toHaveBeenCalled();
    });

    it("fails the run and reports enqueue_failed when the job cannot be queued", async () => {
      asMock(enqueueVendorResearch).mockRejectedValue(new Error("Redis is down"));

      await expect(start()).resolves.toEqual({ ok: false, error: { code: "enqueue_failed" } });

      expect(finishRunQuery).toHaveBeenCalledTimes(1);
      expect(finishRunQuery).toHaveBeenCalledWith({
        organizationId: ORG,
        runId: RUN_ID,
        status: "failed",
        categories: [],
        categorySummary: [],
        evidence: null,
        model: null,
        promptVersion: null,
        searchesUsed: 0,
        pagesRead: 0,
        duplicatesDropped: 0,
        error: "could not enqueue",
        trace: null,
        coverage: null,
        registryVersion: null,
      });
      expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("Redis is down"));
    });

    it("still reports enqueue_failed when the failed run cannot be recorded either", async () => {
      asMock(enqueueVendorResearch).mockRejectedValue(new Error("Redis is down"));
      asMock(finishRunQuery).mockRejectedValue(new Error("database is down"));

      await expect(start()).resolves.toEqual({ ok: false, error: { code: "enqueue_failed" } });

      // The sweep fails the queued run after 15 minutes; both causes are in the log.
      const lines = loggedLines().join("\n");
      expect(lines).toContain("Redis is down");
      expect(lines).toContain("database is down");
    });
  });

  // With Redis down, `queue.add` does not fail: it waits for the connection, for 20 seconds to
  // several minutes or for ever. The start must answer 503 (enqueue_failed) promptly instead.
  describe("a job queue that does not answer", () => {
    /** What the run records, and what the other enqueue test expects for a refused job. */
    const COULD_NOT_ENQUEUE = {
      organizationId: ORG,
      runId: RUN_ID,
      status: "failed",
      categories: [],
      categorySummary: [],
      evidence: null,
      model: null,
      promptVersion: null,
      searchesUsed: 0,
      pagesRead: 0,
      duplicatesDropped: 0,
      error: "could not enqueue",
      trace: null,
      coverage: null,
      registryVersion: null,
    };

    /**
     * Runs `startVendorResearch` on, through its mocked queries, until it has asked for the job.
     * Its timer is only set from there on, a good dozen awaits after the start.
     */
    const untilTheJobIsRequested = async () => {
      for (
        let turn = 0;
        turn < 50 && asMock(enqueueVendorResearch).mock.calls.length === 0;
        turn += 1
      ) {
        await jest.advanceTimersByTimeAsync(0);
      }
      expect(enqueueVendorResearch).toHaveBeenCalledTimes(1);
    };

    /** An `add` that never settles on its own, and the way to settle it later. */
    const hangingAdd = () => {
      const add: { fail: (error: Error) => void; land: () => void } = {
        fail: () => undefined,
        land: () => undefined,
      };
      asMock(enqueueVendorResearch).mockReturnValue(
        new Promise<unknown>((resolve, reject) => {
          add.fail = reject;
          add.land = () => resolve({ id: "late-job" });
        }),
      );
      return add;
    };

    /** Starts a run and keeps its answer, so that a test can look at it while it is still pending. */
    const startAndWatch = () => {
      const watched: { answer?: StartResearchResult } = {};
      const done = start().then((answer) => {
        watched.answer = answer;
      });
      return { watched, done };
    };

    it("waits five seconds, as the spec says", () => {
      expect(ENQUEUE_TIMEOUT_MS).toBe(5000);
    });

    it("gives up after five seconds: the run ends as 'could not enqueue' and the caller gets enqueue_failed", async () => {
      hangingAdd();
      const { watched, done } = startAndWatch();
      await untilTheJobIsRequested();

      // One millisecond short of the wait, nothing has happened.
      await jest.advanceTimersByTimeAsync(4999);
      expect(watched.answer).toBeUndefined();
      expect(finishRunQuery).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(1);
      expect(watched.answer).toEqual({ ok: false, error: { code: "enqueue_failed" } });
      await done;
      expect(finishRunQuery).toHaveBeenCalledTimes(1);
      expect(finishRunQuery).toHaveBeenCalledWith(COULD_NOT_ENQUEUE);
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining(`run ${RUN_ID} could not be queued`),
      );
      expect(jest.getTimerCount()).toBe(0);
    });

    it("does not throw, and does not end the run a second time, when the add fails after the wait", async () => {
      const add = hangingAdd();
      const { watched, done } = startAndWatch();
      await untilTheJobIsRequested();
      await jest.advanceTimersByTimeAsync(5000);
      expect(watched.answer).toEqual({ ok: false, error: { code: "enqueue_failed" } });
      await done;

      // The abandoned add fails now, after the caller has its answer: the run must not be finished
      // a second time, and nothing more is logged for it.
      add.fail(new Error("connection closed"));
      await jest.advanceTimersByTimeAsync(0);

      expect(finishRunQuery).toHaveBeenCalledTimes(1);
      expect(logger.error).toHaveBeenCalledTimes(1);
    });

    it("leaves the answer as it is when the job lands after the wait", async () => {
      const add = hangingAdd();
      const { watched, done } = startAndWatch();
      await untilTheJobIsRequested();
      await jest.advanceTimersByTimeAsync(5000);
      expect(watched.answer).toEqual({ ok: false, error: { code: "enqueue_failed" } });
      await done;

      // The worker finds the run failed and skips it (markRunRunningQuery refuses a failed run).
      add.land();
      await jest.advanceTimersByTimeAsync(0);

      expect(watched.answer).toEqual({ ok: false, error: { code: "enqueue_failed" } });
      expect(finishRunQuery).toHaveBeenCalledTimes(1);
    });

    it("answers as it always did, and leaves no timer behind, when the job is queued at once", async () => {
      const created = makeRun({ id: 42 });
      asMock(createRunQuery).mockResolvedValue(created);

      await expect(start()).resolves.toEqual({ ok: true, run: created, alreadyRunning: false });

      expect(jest.getTimerCount()).toBe(0);
      // Nothing fires later either.
      await jest.advanceTimersByTimeAsync(2 * 5000);
      expect(finishRunQuery).not.toHaveBeenCalled();
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("leaves no timer behind when the queue refuses the job at once", async () => {
      asMock(enqueueVendorResearch).mockRejectedValue(new Error("Redis is down"));

      await expect(start()).resolves.toEqual({ ok: false, error: { code: "enqueue_failed" } });

      expect(finishRunQuery).toHaveBeenCalledTimes(1);
      expect(jest.getTimerCount()).toBe(0);
    });

    it("lets an automatic start end the same way, instead of waiting in the background for ever", async () => {
      hangingAdd();
      let finished = false;
      const done = triggerAutoResearch(autoArgs).then(() => {
        finished = true;
      });
      await untilTheJobIsRequested();

      await jest.advanceTimersByTimeAsync(5000);

      expect(finished).toBe(true);
      await done;
      expect(finishRunQuery).toHaveBeenCalledWith(COULD_NOT_ENQUEUE);
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining("the job could not be queued"),
      );
    });
  });
});

describe("triggerAutoResearch", () => {
  it("creates an automatic run without a requester and queues it", async () => {
    await expect(triggerAutoResearch(autoArgs)).resolves.toBeUndefined();

    expect(createRunQuery).toHaveBeenCalledWith({
      organizationId: ORG,
      vendorId: VENDOR,
      triggerType: "auto",
      requestedBy: null,
    });
    expect(enqueueVendorResearch).toHaveBeenCalledWith(ORG, VENDOR, RUN_ID);
  });

  // Each reason that stops an automatic start is logged with the ids and the reason, and nothing is persisted.
  it.each<[string, () => void, Partial<typeof autoArgs>, string]>([
    ["a demo vendor", () => undefined, { isDemo: true }, "demo vendors are not researched"],
    [
      "automatic research turned off",
      () => asMock(getVendorResearchConfig).mockReturnValue({ ...CONFIGURED, autoRun: false }),
      {},
      "automatic research is turned off",
    ],
    [
      "a vendor that is not found",
      () => asMock(getVendorByIdQuery).mockResolvedValue(null),
      {},
      "the vendor was not found",
    ],
    [
      "an organization without an LLM key",
      () => asMock(getLLMKeysQuery).mockResolvedValue([]),
      {},
      "the organization has no LLM key",
    ],
    [
      "a reached daily cap",
      () => asMock(countRunsSinceQuery).mockResolvedValue(50),
      {},
      "the daily run cap is reached",
    ],
  ])("starts nothing, and logs why, for %s", async (_label, arrange, args, reason) => {
    arrange();

    await expect(triggerAutoResearch({ ...autoArgs, ...args })).resolves.toBeUndefined();

    expectNothingStarted();
    expect(logger.info).toHaveBeenCalledWith(
      expect.stringContaining(`vendor ${VENDOR} (org ${ORG})`),
    );
    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining(reason));
  });

  // An install without an LLM key is the usual way for an automatic start not to happen. It is
  // logged, with the ids only, and nothing is stored.
  it("creates no run, and logs once that it was not started, for an organization without an LLM key", async () => {
    asMock(getLLMKeysQuery).mockResolvedValue([]);

    await expect(triggerAutoResearch(autoArgs)).resolves.toBeUndefined();

    expectNothingStarted();
    expect(failStaleRunsQuery).not.toHaveBeenCalled();
    expect(loggedLines()).toEqual([
      `vendor research for vendor ${VENDOR} (org ${ORG}): not started, the organization has no LLM key`,
    ]);
  });

  it("does not even look the vendor up for a demo vendor or when automatic research is off", async () => {
    await triggerAutoResearch({ ...autoArgs, isDemo: true });
    asMock(getVendorResearchConfig).mockReturnValue({ ...CONFIGURED, autoRun: false });
    await triggerAutoResearch(autoArgs);

    expect(getVendorByIdQuery).not.toHaveBeenCalled();
  });

  it("does not reject when something fails, and logs the error", async () => {
    asMock(getVendorByIdQuery).mockRejectedValue(new Error("database is down"));

    await expect(triggerAutoResearch(autoArgs)).resolves.toBeUndefined();

    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("database is down"));
    expectNothingStarted();
  });
});
