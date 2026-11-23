/**
 * triggerIncidentResponse starts at most one incident_response run per
 * incident: the existing-run lookup and the run insert happen under a
 * per-incident advisory lock on ONE transaction (the run is created on it),
 * and an incident that already has a live run gets no second one. Failed runs
 * and stale pending runs do not count; a run that cannot start is marked
 * failed.
 */
import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockTx = { id: "tx" };
jest.mock("../../../database/db", () => ({
  sequelize: {
    transaction: jest.fn(async (callback: any) => callback(mockTx)),
    query: jest.fn(),
  },
}));
jest.mock("../engine", () => ({
  createRun: jest.fn(),
  persistRun: jest.fn(),
  runWorkflow: jest.fn(),
  startWorkflow: jest.fn(),
}));
jest.mock("../registry", () => ({
  getWorkflow: jest.fn(),
}));
jest.mock("../../../utils/organization.utils", () => ({
  getAllOrganizationsQuery: jest.fn(),
}));

import { sequelize } from "../../../database/db";
import { createRun, persistRun, runWorkflow, startWorkflow } from "../engine";
import { getWorkflow } from "../registry";
import { INCIDENT_RESPONSE_STALE_PENDING_MINUTES, triggerIncidentResponse } from "../triggers";

const mockQuery = sequelize.query as unknown as jest.Mock<any>;
const mockCreateRun = createRun as unknown as jest.Mock<any>;
const mockRunWorkflow = runWorkflow as unknown as jest.Mock<any>;
const mockGetWorkflow = getWorkflow as unknown as jest.Mock<any>;
const mockPersistRun = persistRun as unknown as jest.Mock<any>;

const wf = { id: "incident_response", triggerName: "incident.critical", steps: [] };

/** Answer the advisory lock, then the existing-run lookup with `existing`. */
function dbWith(existing: Array<{ id: number }>) {
  mockQuery.mockImplementation(async (sql: string) =>
    sql.includes("pg_advisory_xact_lock") ? [{}] : existing,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetWorkflow.mockReturnValue(wf);
  mockCreateRun.mockResolvedValue(501);
  mockRunWorkflow.mockResolvedValue({ id: 501, state: "awaiting_approval" });
  mockPersistRun.mockResolvedValue(undefined);
});

describe("triggerIncidentResponse (once per incident)", () => {
  it("creates and runs a run when the incident has none", async () => {
    dbWith([]);

    await triggerIncidentResponse(42, 99, "Very serious");

    const params = {
      organizationId: 42,
      triggerPayload: { incidentId: 99, severity: "Very serious" },
    };
    // Created on the lock's own transaction: no second pooled connection.
    expect(mockCreateRun).toHaveBeenCalledWith(wf, params, mockTx);
    expect(mockRunWorkflow).toHaveBeenCalledWith(wf, 501, params);
    expect(startWorkflow).not.toHaveBeenCalled();
  });

  it("takes the per-incident lock before looking for an existing run, on one transaction", async () => {
    dbWith([]);

    await triggerIncidentResponse(42, 99, "Very serious");

    const [lockCall, lookupCall] = mockQuery.mock.calls as any[];
    expect(lockCall[0]).toContain("pg_advisory_xact_lock");
    expect(lockCall[1]).toMatchObject({ replacements: { key: "42:99" }, transaction: mockTx });
    expect(lookupCall[0]).toContain("trigger_payload->>'incidentId'");
    expect(lookupCall[1]).toMatchObject({
      replacements: { organizationId: 42, workflowType: "incident_response", incidentId: "99" },
      transaction: mockTx,
    });
  });

  it("starts nothing when the incident already has a run (created critical, or escalated before)", async () => {
    dbWith([{ id: 7 }]);

    await triggerIncidentResponse(42, 99, "Very serious");

    expect(mockCreateRun).not.toHaveBeenCalled();
    expect(mockRunWorkflow).not.toHaveBeenCalled();
  });

  it("create then a later escalation: one run", async () => {
    // First call finds nothing and creates run 501; afterwards the lookup sees it.
    const runs: Array<{ id: number }> = [];
    mockQuery.mockImplementation(async (sql: string) =>
      sql.includes("pg_advisory_xact_lock") ? [{}] : [...runs],
    );
    mockCreateRun.mockImplementation(async () => {
      runs.push({ id: 501 });
      return 501;
    });

    await triggerIncidentResponse(42, 99, "Very serious");
    await triggerIncidentResponse(42, 99, "Very serious");

    expect(mockCreateRun).toHaveBeenCalledTimes(1);
    expect(mockRunWorkflow).toHaveBeenCalledTimes(1);
  });

  it("does nothing when the workflow is not registered", async () => {
    mockGetWorkflow.mockReturnValue(undefined);

    await triggerIncidentResponse(42, 99, "Very serious");

    expect(mockQuery).not.toHaveBeenCalled();
    expect(mockCreateRun).not.toHaveBeenCalled();
  });

  it("never throws: a failed lookup is logged", async () => {
    mockQuery.mockRejectedValue(new Error("db down"));

    await expect(triggerIncidentResponse(42, 99, "Very serious")).resolves.toBeUndefined();
    expect(mockRunWorkflow).not.toHaveBeenCalled();
  });

  it("ignores failed runs and pending runs older than the stale limit", async () => {
    dbWith([]);

    await triggerIncidentResponse(42, 99, "Very serious");

    const lookup = (mockQuery.mock.calls as any[])[1];
    expect(lookup[0]).toContain("state <> 'failed'");
    expect(lookup[0]).toContain("state = 'pending'");
    expect(lookup[1].replacements.staleMinutes).toBe(INCIDENT_RESPONSE_STALE_PENDING_MINUTES);
    expect(INCIDENT_RESPONSE_STALE_PENDING_MINUTES).toBe(10);
  });

  it("marks the run failed when it cannot be started, so it never blocks the incident", async () => {
    dbWith([]);
    mockRunWorkflow.mockRejectedValue(new Error("connection lost"));

    await expect(triggerIncidentResponse(42, 99, "Very serious")).resolves.toBeUndefined();

    expect(mockPersistRun).toHaveBeenCalledWith(
      501,
      42,
      "failed",
      0,
      [],
      expect.stringContaining("connection lost"),
    );
  });

  it("does not mark anything failed when no run was created", async () => {
    dbWith([{ id: 7 }]);

    await triggerIncidentResponse(42, 99, "Very serious");

    expect(mockPersistRun).not.toHaveBeenCalled();
  });
});
