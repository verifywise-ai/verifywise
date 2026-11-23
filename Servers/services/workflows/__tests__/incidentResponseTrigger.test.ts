/**
 * triggerIncidentResponse starts at most one incident_response run per
 * incident: the existing-run lookup and the run insert happen under a
 * per-incident advisory lock, and an incident that already has a run (in any
 * state) gets no second one.
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
import { createRun, runWorkflow, startWorkflow } from "../engine";
import { getWorkflow } from "../registry";
import { triggerIncidentResponse } from "../triggers";

const mockQuery = sequelize.query as unknown as jest.Mock<any>;
const mockCreateRun = createRun as unknown as jest.Mock<any>;
const mockRunWorkflow = runWorkflow as unknown as jest.Mock<any>;
const mockGetWorkflow = getWorkflow as unknown as jest.Mock<any>;

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
});

describe("triggerIncidentResponse (once per incident)", () => {
  it("creates and runs a run when the incident has none", async () => {
    dbWith([]);

    await triggerIncidentResponse(42, 99, "Very serious");

    const params = {
      organizationId: 42,
      triggerPayload: { incidentId: 99, severity: "Very serious" },
    };
    expect(mockCreateRun).toHaveBeenCalledWith(wf, params);
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
});
