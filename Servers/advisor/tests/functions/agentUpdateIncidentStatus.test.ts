import { beforeEach, describe, expect, it, jest } from "@jest/globals";

const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), afterCommit: jest.fn() };

jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => mockTransaction), query: jest.fn() },
}));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
// Real diff (through the real shared service); the queries are stubbed.
jest.mock("../../../utils/incidentManagement.utils", () => ({
  ...(jest.requireActual("../../../utils/incidentManagement.utils") as object),
  getAllIncidentsQuery: jest.fn(),
  getIncidentByIdQuery: jest.fn(),
  createNewIncidentQuery: jest.fn(),
  updateIncidentByIdQuery: jest.fn(),
  deleteIncidentByIdQuery: jest.fn(),
  archiveIncidentByIdQuery: jest.fn(),
  validateIncidentReferences: jest.fn(async () => []),
  enqueueIncidentUpdatedAutomations: jest.fn(async () => undefined),
}));
jest.mock("../../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));
// Real change tracking; only the history write is stubbed.
jest.mock("../../../utils/changeHistory.base.utils", () => ({
  ...(jest.requireActual("../../../utils/changeHistory.base.utils") as object),
  recordMultipleFieldChanges: jest.fn(),
}));

import { writeToolExecutors } from "../../confirmation/createWriteTool";
import "../../functions/incidentFunctions";
import {
  getIncidentByIdQuery,
  updateIncidentByIdQuery,
} from "../../../utils/incidentManagement.utils";
import { recordMultipleFieldChanges } from "../../../utils/changeHistory.base.utils";
import { storedIncident } from "../../../services/__tests__/helpers/incidentFixtures";

const mockGet = getIncidentByIdQuery as jest.MockedFunction<any>;
const mockUpdate = updateIncidentByIdQuery as jest.MockedFunction<any>;
const mockRecord = recordMultipleFieldChanges as jest.MockedFunction<any>;

const execute = (params: Record<string, unknown>) =>
  writeToolExecutors.get("agent_update_incident_status")!(params, 1);

function closedIncident(approval_status: string) {
  const incident = storedIncident();
  incident.dataValues.approval_status = approval_status;
  return incident;
}

describe("agent_update_incident_status — reopening", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdate.mockImplementation(async (_id: number, changed: any) => ({
      id: 42,
      ai_project: "Chatbot",
      ...changed,
    }));
  });

  it("reopens a Closed incident, resets its approval and records history as the user", async () => {
    mockGet.mockResolvedValue(closedIncident("Approved"));

    const result = await execute({ incident_id: 42, status: "Investigating", _userId: 5 });

    expect(result).toEqual({ id: 42, ai_project: "Chatbot", status: "Investigating" });
    expect(mockUpdate.mock.calls[0][1]).toEqual({
      status: "Investigating",
      approval_status: "Pending",
      approved_by: null,
      approval_date: null,
      approval_notes: null,
    });

    const [entity, incidentId, userId, orgId, changes, , system] = mockRecord.mock.calls[0];
    expect([entity, incidentId, userId, orgId, system]).toEqual(["incident", 42, 5, 1, false]);
    expect(changes).toEqual(
      expect.arrayContaining([
        { fieldName: "Status", oldValue: "Closed", newValue: "Investigating" },
        { fieldName: "Approval status", oldValue: "Approved", newValue: "Pending" },
      ]),
    );
    expect(mockTransaction.commit).toHaveBeenCalled();
  });

  it("leaves a Rejected approval alone and records only the status change", async () => {
    mockGet.mockResolvedValue(closedIncident("Rejected"));

    await execute({ incident_id: 42, status: "Open", _userId: 5 });

    expect(mockUpdate.mock.calls[0][1]).toEqual({ status: "Open" });
    expect(mockRecord.mock.calls[0][4]).toEqual([
      { fieldName: "Status", oldValue: "Closed", newValue: "Open" },
    ]);
  });

  it("records history as a system change when the execution has no user id", async () => {
    mockGet.mockResolvedValue(closedIncident("Rejected"));

    await execute({ incident_id: 42, status: "Open" });

    const [, , userId, , changes, , system] = mockRecord.mock.calls[0];
    expect(userId).toBeNull();
    expect(system).toBe(true);
    expect(changes).toEqual([{ fieldName: "Status", oldValue: "Closed", newValue: "Open" }]);
  });

  it("throws when the incident does not exist", async () => {
    mockGet.mockResolvedValue(null);

    await expect(execute({ incident_id: 99, status: "Open", _userId: 5 })).rejects.toThrow(
      "Incident #99 not found",
    );
  });
});
