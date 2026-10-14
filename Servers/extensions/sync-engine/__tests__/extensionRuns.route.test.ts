import request from "supertest";
import express from "express";
import { BUILTIN_ROLE_PERMISSIONS } from "../../../config/rolePermissions.config";

jest.mock("../../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../../utils/rolePermissions.utils", () => ({
  roleHasPermission: async (_orgId: number | null, role: string, key: string) =>
    BUILTIN_ROLE_PERMISSIONS[role]?.has(key as never) ?? false,
}));
jest.mock("../../../middleware/auth.middleware", () => ({
  __esModule: true,
  default: (req: any, _res: any, next: any) => {
    req.userId = 9;
    req.organizationId = 42;
    req.role = req.headers["x-test-role"] || "Admin";
    req.t = (key: string) => key;
    next();
  },
}));
jest.mock("../../../middleware/requireExtensionEnabled.middleware", () => ({
  requireExtensionEnabledFromParam: () => (req: any, res: any, next: any) =>
    req.headers["x-test-disabled"] ? res.status(403).json({ message: "Forbidden" }) : next(),
}));
jest.mock("../providers", () => ({ registerAllSyncProviders: jest.fn() }));
jest.mock("../jobs", () => ({ startManualRun: jest.fn() }));
jest.mock("../status", () => ({
  ...jest.requireActual("../status"),
  getRunStatus: jest.fn(),
  listRuns: jest.fn(),
}));
jest.mock("../schedule", () => ({
  ...jest.requireActual("../schedule"),
  saveSchedule: jest.fn(),
}));
jest.mock("../../../services/automations/automationProducer", () => {
  class BackgroundJobsUnavailableError extends Error {}
  return { BackgroundJobsUnavailableError, hasPendingExtensionSyncJob: jest.fn() };
});
jest.mock("../../../utils/logger/logHelper", () => ({
  logProcessing: jest.fn(),
  logSuccess: jest.fn(),
  logFailure: jest.fn(),
}));
jest.mock("../../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../../../utils/i18n.utils", () => ({
  translateError: jest.fn(() => "Something went wrong"),
}));

import extensionRunsRoutes from "../../../routes/extensionRuns.route";
import {
  BackgroundJobsUnavailableError,
  hasPendingExtensionSyncJob,
} from "../../../services/automations/automationProducer";
import { logSuccess } from "../../../utils/logger/logHelper";
import { SyncInProgressError, SyncNotReadyError } from "../errors";
import { startManualRun } from "../jobs";
import { __resetSyncProvidersForTests, registerSyncProvider } from "../registry";
import { saveSchedule } from "../schedule";
import { getRunStatus, listRuns } from "../status";

const mockCanSchedule = jest.fn();
const mockStart = startManualRun as jest.Mock;
const mockSave = saveSchedule as jest.Mock;

const app = express();
app.use(express.json());
app.use("/api/extensions", extensionRunsRoutes);
// Stands in for the per-extension routers mounted after the generic one.
app.use("/api/extensions", (_req, res) => {
  res.status(299).json({ fellThrough: true });
});

const SCHEDULE = {
  enabled: true,
  interval_hours: 12,
  consecutive_failures: 0,
  failing_since: null,
};

beforeAll(() => {
  __resetSyncProvidersForTests();
  registerSyncProvider({
    key: "demo-ext",
    kinds: ["manual", "scheduled"],
    scheduledKind: "scheduled",
    readiness: async () => ({ ready: true }),
    canSchedule: (orgId) => mockCanSchedule(orgId),
    run: async () => ({ counts: {} }),
  });
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCanSchedule.mockResolvedValue({ ready: true });
  mockSave.mockResolvedValue(SCHEDULE);
});

describe("keys without a sync provider", () => {
  it.each([
    ["post", "/api/extensions/mlflow/runs"],
    ["get", "/api/extensions/mlflow/runs/status"],
    ["get", "/api/extensions/mlflow/runs"],
    ["patch", "/api/extensions/mlflow/schedule"],
  ])("fall through %s %s to the next router", async (method, path) => {
    const res = await (request(app) as any)[method](path).send({});
    expect(res.status).toBe(299);
  });
});

describe("POST /:key/runs", () => {
  it("queues a manual run: 202 with the job id and the run seen before", async () => {
    mockStart.mockResolvedValue({ jobId: "ext-sync-demo-ext-42", previousRunId: 40 });
    const res = await request(app).post("/api/extensions/demo-ext/runs");
    expect(res.status).toBe(202);
    expect(res.body.data).toEqual({ jobId: "ext-sync-demo-ext-42", previousRunId: 40 });
    expect(mockStart).toHaveBeenCalledWith("demo-ext", 42, 9);
  });

  it.each([
    [new SyncNotReadyError(404, "Not configured"), 404, "Not configured"],
    [new SyncNotReadyError(400, "Pick a type"), 400, "Pick a type"],
    [new SyncInProgressError(), 409, "A sync is already running for this extension"],
  ])("maps %p to %p", async (err, status, reason) => {
    mockStart.mockRejectedValue(err);
    const res = await request(app).post("/api/extensions/demo-ext/runs");
    expect(res.status).toBe(status);
    expect(res.body.data).toBe(reason);
  });

  it("is 503 when the queue does not answer", async () => {
    mockStart.mockRejectedValue(
      new BackgroundJobsUnavailableError("Background jobs are unavailable"),
    );
    expect((await request(app).post("/api/extensions/demo-ext/runs")).status).toBe(503);
  });

  it("needs extension.admin and the extension enabled", async () => {
    expect(
      (await request(app).post("/api/extensions/demo-ext/runs").set("x-test-role", "Editor"))
        .status,
    ).toBe(403);
    expect(
      (await request(app).post("/api/extensions/demo-ext/runs").set("x-test-disabled", "1")).status,
    ).toBe(403);
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe("GET /:key/runs/status", () => {
  it("adds whether a job is queued, and null when the queue does not answer", async () => {
    (getRunStatus as jest.Mock).mockResolvedValue({
      schedule: null,
      running: false,
      latest_run: null,
      last_finished_run: null,
    });
    (hasPendingExtensionSyncJob as jest.Mock).mockResolvedValueOnce(true);
    let res = await request(app)
      .get("/api/extensions/demo-ext/runs/status")
      .set("x-test-role", "Auditor");
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({
      schedule: null,
      running: false,
      queued: true,
      latest_run: null,
      last_finished_run: null,
    });
    expect(getRunStatus).toHaveBeenCalledWith("demo-ext", 42);

    (hasPendingExtensionSyncJob as jest.Mock).mockRejectedValueOnce(new Error("redis down"));
    res = await request(app).get("/api/extensions/demo-ext/runs/status");
    expect(res.body.data.queued).toBeNull();
  });
});

describe("GET /:key/runs", () => {
  it.each([
    ["", 20],
    ["?limit=7", 7],
    ["?limit=-5", 20],
    ["?limit=abc", 20],
    ["?limit=5000", 200],
  ])("parses limit defensively: %p lists %p", async (query, limit) => {
    (listRuns as jest.Mock).mockResolvedValue([]);
    const res = await request(app).get(`/api/extensions/demo-ext/runs${query}`);
    expect(res.status).toBe(200);
    expect(listRuns).toHaveBeenCalledWith("demo-ext", 42, limit);
  });
});

describe("PATCH /:key/schedule", () => {
  it("saves the fields sent, accepting a numeric string, and logs the change", async () => {
    const res = await request(app)
      .patch("/api/extensions/demo-ext/schedule")
      .send({ interval_hours: "12" });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(SCHEDULE);
    expect(mockSave).toHaveBeenCalledWith(
      "demo-ext",
      42,
      { enabled: undefined, intervalHours: 12 },
      { userId: 9 },
    );
    expect(logSuccess).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "Update",
        description: "Updated demo-ext sync settings (enabled: true, every 12 h)",
      }),
    );
  });

  it.each([
    [{}],
    [{ enabled: "yes" }],
    [{ interval_hours: null }],
    [{ interval_hours: "" }],
    [{ interval_hours: "12.5" }],
    [{ interval_hours: 0 }],
    [{ interval_hours: 169 }],
  ])("validates the schedule body: %p is 400", async (body) => {
    const res = await request(app).patch("/api/extensions/demo-ext/schedule").send(body);
    expect(res.status).toBe(400);
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("lets the provider refuse with its status", async () => {
    mockCanSchedule.mockResolvedValue({ ready: false, status: 404, reason: "Not configured" });
    const res = await request(app)
      .patch("/api/extensions/demo-ext/schedule")
      .send({ enabled: true });
    expect(res.status).toBe(404);
    expect(res.body.data).toBe("Not configured");
    expect(mockSave).not.toHaveBeenCalled();
  });

  it("needs extension.admin", async () => {
    const res = await request(app)
      .patch("/api/extensions/demo-ext/schedule")
      .set("x-test-role", "Editor")
      .send({ enabled: true });
    expect(res.status).toBe(403);
  });
});
