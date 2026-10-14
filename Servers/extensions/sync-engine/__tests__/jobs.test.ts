jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../providers", () => ({ registerAllSyncProviders: jest.fn() }));
jest.mock("../../../services/automations/automationProducer", () => ({
  enqueueExtensionSyncRun: jest.fn(),
}));
jest.mock("../claim", () => ({
  claimRun: jest.fn(),
  closeStaleRunsForProvider: jest.fn(),
  createRunContext: jest.fn(() => ({ fake: "ctx" })),
  recordSkippedRun: jest.fn(),
  runClaimed: jest.fn(),
}));
jest.mock("../schedule", () => ({ findDueRuns: jest.fn() }));
jest.mock("../status", () => ({ hasLiveRun: jest.fn(), latestStatusRunId: jest.fn() }));

import { enqueueExtensionSyncRun } from "../../../services/automations/automationProducer";
import {
  claimRun,
  closeStaleRunsForProvider,
  createRunContext,
  recordSkippedRun,
  runClaimed,
} from "../claim";
import { SyncInProgressError, SyncNotReadyError, UnknownSyncProviderError } from "../errors";
import {
  handleExtensionSyncJob,
  isExtensionSyncJob,
  runExtensionSyncJob,
  runExtensionSyncTick,
  startManualRun,
} from "../jobs";
import { __resetSyncProvidersForTests, registerSyncProvider } from "../registry";
import { findDueRuns } from "../schedule";
import { hasLiveRun, latestStatusRunId } from "../status";
import type { SyncProvider } from "../types";

const mockReadiness = jest.fn();
const mockEnqueue = enqueueExtensionSyncRun as jest.Mock;
const mockClaim = claimRun as jest.Mock;
const mockFindDue = findDueRuns as jest.Mock;
const mockSweep = closeStaleRunsForProvider as jest.Mock;

const jira: SyncProvider = {
  key: "jira-assets",
  kinds: ["manual", "scheduled", "import"],
  scheduledKind: "scheduled",
  readiness: (orgId, kind) => mockReadiness(orgId, kind),
  run: async () => ({ counts: {} }),
};
const manualOnly: SyncProvider = {
  key: "manual-only",
  kinds: ["manual"],
  readiness: async () => ({ ready: true }),
  run: async () => ({ counts: {} }),
};
const CLAIMED = {
  runId: 91,
  token: "t",
  orgId: 5,
  key: "jira-assets",
  kind: "manual",
  triggeredBy: 8,
};

beforeAll(() => {
  __resetSyncProvidersForTests();
  registerSyncProvider(jira);
  registerSyncProvider(manualOnly);
});

beforeEach(() => {
  jest.clearAllMocks();
  mockReadiness.mockResolvedValue({ ready: true });
  mockEnqueue.mockResolvedValue({ jobId: "ext-sync-jira-assets-5", queued: true });
  mockClaim.mockResolvedValue(CLAIMED);
  mockFindDue.mockResolvedValue([]);
  mockSweep.mockResolvedValue([]);
});

describe("runExtensionSyncTick", () => {
  it("queues one scheduled job per due and ready org", async () => {
    mockFindDue.mockResolvedValue([{ organization_id: 5 }, { organization_id: 6 }]);
    mockReadiness.mockImplementation(async (orgId: number) =>
      orgId === 6 ? { ready: false, status: 400, reason: "No use cases" } : { ready: true },
    );

    await expect(runExtensionSyncTick()).resolves.toEqual({
      candidates: 2,
      queued: 1,
      alreadyQueued: 0,
      notReady: 1,
      failed: 0,
    });
    expect(mockFindDue).toHaveBeenCalledTimes(1);
    expect(mockReadiness).toHaveBeenCalledWith(5, "scheduled");
    expect(mockEnqueue).toHaveBeenCalledTimes(1);
    expect(mockEnqueue).toHaveBeenCalledWith({
      key: "jira-assets",
      orgId: 5,
      kind: "scheduled",
      triggeredBy: null,
      payload: null,
    });
    expect(recordSkippedRun).not.toHaveBeenCalled();
  });

  it("closes stale runs before it looks for due orgs, so backoff counts them", async () => {
    const order: string[] = [];
    mockSweep.mockImplementation(async () => {
      order.push("sweep");
      return [5];
    });
    mockFindDue.mockImplementation(async () => {
      order.push("due");
      return [];
    });

    await runExtensionSyncTick();

    expect(mockSweep).toHaveBeenCalledWith(jira);
    expect(mockSweep).not.toHaveBeenCalledWith(manualOnly);
    expect(order).toEqual(["sweep", "due"]);
  });

  it("still looks for due orgs when the stale-run sweep fails", async () => {
    mockSweep.mockRejectedValue(new Error("db blip"));
    mockFindDue.mockResolvedValue([{ organization_id: 5 }]);

    await expect(runExtensionSyncTick()).resolves.toMatchObject({ candidates: 1, queued: 1 });
  });

  it("counts a job that is already waiting, and keeps going after one org fails", async () => {
    mockFindDue.mockResolvedValue([
      { organization_id: 5 },
      { organization_id: 6 },
      { organization_id: 7 },
    ]);
    mockEnqueue
      .mockResolvedValueOnce({ jobId: "ext-sync-jira-assets-5", queued: false })
      .mockRejectedValueOnce(new Error("redis down"))
      .mockResolvedValueOnce({ jobId: "ext-sync-jira-assets-7", queued: true });

    await expect(runExtensionSyncTick()).resolves.toEqual({
      candidates: 3,
      queued: 1,
      alreadyQueued: 1,
      notReady: 0,
      failed: 1,
    });
  });
});

describe("runExtensionSyncJob", () => {
  it("claims at pickup and runs the claimed run", async () => {
    await expect(
      runExtensionSyncJob({
        key: "jira-assets",
        orgId: 5,
        kind: "manual",
        triggeredBy: 8,
        payload: { x: 1 },
      }),
    ).resolves.toBe("ran");
    expect(mockClaim).toHaveBeenCalledWith("jira-assets", 5, "manual", 8);
    expect(createRunContext).toHaveBeenCalledWith(jira, CLAIMED, { x: 1 });
    expect(runClaimed).toHaveBeenCalledWith(jira, { fake: "ctx" });
    // Enablement and readiness are not checked at pickup.
    expect(mockReadiness).not.toHaveBeenCalled();
  });

  it("records a skipped row for a manual job when another run is live", async () => {
    mockClaim.mockRejectedValue(new SyncInProgressError());
    await expect(
      runExtensionSyncJob({ key: "jira-assets", orgId: 5, kind: "manual", triggeredBy: 8 }),
    ).resolves.toBe("skipped");
    expect(recordSkippedRun).toHaveBeenCalledWith("jira-assets", 5, "manual", 8);
    expect(runClaimed).not.toHaveBeenCalled();
  });

  it("skips a scheduled job quietly when another run is live", async () => {
    mockClaim.mockRejectedValue(new SyncInProgressError());
    await expect(
      runExtensionSyncJob({ key: "jira-assets", orgId: 5, kind: "scheduled", triggeredBy: null }),
    ).resolves.toBe("skipped");
    expect(recordSkippedRun).not.toHaveBeenCalled();
  });

  it.each([
    [{ orgId: 5, kind: "manual" }],
    [{ key: "Bad Key", orgId: 5, kind: "manual" }],
    [{ key: "jira-assets", orgId: 0, kind: "manual" }],
    [{ key: "jira-assets", orgId: "x", kind: "manual" }],
    [{ key: "jira-assets", orgId: 5, kind: "import" }],
    [{ key: "jira-assets", orgId: 5 }],
    [null],
  ])("fails closed on the payload %p, before claiming", async (data) => {
    await expect(runExtensionSyncJob(data)).rejects.toThrow("extension_sync_run");
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("fails a job for a key with no registered provider, claiming nothing", async () => {
    await expect(
      runExtensionSyncJob({ key: "gone-ext", orgId: 5, kind: "manual" }),
    ).rejects.toBeInstanceOf(UnknownSyncProviderError);
    expect(mockClaim).not.toHaveBeenCalled();
  });

  it("falls back to no user for an invalid triggeredBy", async () => {
    await runExtensionSyncJob({
      key: "jira-assets",
      orgId: 5,
      kind: "manual",
      triggeredBy: "nobody",
    });
    expect(mockClaim).toHaveBeenCalledWith("jira-assets", 5, "manual", null);
  });
});

describe("job names", () => {
  it("knows the engine's jobs and the old Jira names", () => {
    for (const name of [
      "extension_sync_tick",
      "extension_sync_run",
      "jira_assets_scheduled_sync_check",
      "jira_assets_sync_run",
    ]) {
      expect(isExtensionSyncJob(name)).toBe(true);
    }
    expect(isExtensionSyncJob("risk_link_recompute")).toBe(false);
  });

  it("routes the old Jira run job to the engine", async () => {
    await handleExtensionSyncJob("jira_assets_sync_run", {
      organizationId: 5,
      triggeredBy: 8,
      syncType: "manual",
    });
    expect(mockClaim).toHaveBeenCalledWith("jira-assets", 5, "manual", 8);
  });

  it("routes the old Jira check job and the tick to the tick", async () => {
    await handleExtensionSyncJob("jira_assets_scheduled_sync_check", {});
    await handleExtensionSyncJob("extension_sync_tick", {});
    expect(mockFindDue).toHaveBeenCalledTimes(2);
  });

  it("refuses a name that is not a sync job", async () => {
    await expect(handleExtensionSyncJob("send_email", {})).rejects.toThrow(
      "Not an extension sync job: send_email",
    );
  });
});

describe("startManualRun", () => {
  it("checks readiness and liveness, then queues the manual run", async () => {
    (hasLiveRun as jest.Mock).mockResolvedValue(false);
    (latestStatusRunId as jest.Mock).mockResolvedValue(40);

    await expect(startManualRun("jira-assets", 5, 8)).resolves.toEqual({
      jobId: "ext-sync-jira-assets-5",
      previousRunId: 40,
    });
    expect(mockReadiness).toHaveBeenCalledWith(5, "manual");
    expect(mockEnqueue).toHaveBeenCalledWith({
      key: "jira-assets",
      orgId: 5,
      kind: "manual",
      triggeredBy: 8,
      payload: null,
    });
  });

  it("refuses with the provider's status and reason when not ready", async () => {
    mockReadiness.mockResolvedValue({ ready: false, status: 404, reason: "Not configured" });
    const err = await startManualRun("jira-assets", 5, 8).catch((e) => e);
    expect(err).toBeInstanceOf(SyncNotReadyError);
    expect(err).toMatchObject({ status: 404, message: "Not configured" });
    expect(mockEnqueue).not.toHaveBeenCalled();
  });

  it("refuses while a run is live or a job is already waiting", async () => {
    (hasLiveRun as jest.Mock).mockResolvedValue(true);
    await expect(startManualRun("jira-assets", 5, 8)).rejects.toBeInstanceOf(SyncInProgressError);
    (hasLiveRun as jest.Mock).mockResolvedValue(false);
    mockEnqueue.mockResolvedValue({ jobId: "ext-sync-jira-assets-5", queued: false });
    await expect(startManualRun("jira-assets", 5, 8)).rejects.toBeInstanceOf(SyncInProgressError);
  });

  it("rejects a key with no provider", async () => {
    await expect(startManualRun("nope", 5, 8)).rejects.toBeInstanceOf(UnknownSyncProviderError);
  });
});
