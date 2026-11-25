import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// The advisor's incident writes hold the same permission keys as the REST
// routes (routes/aiIncidentManagement.route.ts), checked when a write is
// proposed and again when it runs.

const mockTransaction = { commit: jest.fn(), rollback: jest.fn(), afterCommit: jest.fn() };

jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(async () => mockTransaction), query: jest.fn() },
}));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../utils/userPermission.utils", () => ({ userHasPermission: jest.fn() }));
jest.mock("../../../utils/incidentManagement.utils", () => ({
  ...(jest.requireActual("../../../utils/incidentManagement.utils") as object),
  getIncidentByIdQuery: jest.fn(),
  createNewIncidentQuery: jest.fn(),
  updateIncidentByIdQuery: jest.fn(),
  deleteIncidentByIdQuery: jest.fn(),
  archiveIncidentByIdQuery: jest.fn(),
  validateIncidentReferences: jest.fn(async () => []),
  enqueueIncidentUpdatedAutomations: jest.fn(async () => undefined),
}));
jest.mock("../../../utils/changeHistory.base.utils", () => ({
  ...(jest.requireActual("../../../utils/changeHistory.base.utils") as object),
  recordMultipleFieldChanges: jest.fn(),
}));
jest.mock("../../../services/automations/automationProducer", () => ({
  enqueueAutomationAction: jest.fn(),
}));

import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { availableIncidentTools } from "../../functions/incidentFunctions";
import { submitForApproval } from "../../approval/approvalGateway";
import { userHasPermission } from "../../../utils/userPermission.utils";
import { sequelize } from "../../../database/db";
import * as incidentUtils from "../../../utils/incidentManagement.utils";
import { storedIncident } from "../../../services/__tests__/helpers/incidentFixtures";

type AsyncMock = jest.Mock<(...args: any[]) => Promise<any>>;
const hasPermission = userHasPermission as unknown as AsyncMock;
const submit = submitForApproval as unknown as AsyncMock;
const startTransaction = sequelize.transaction as unknown as AsyncMock;

const TOOLS: Array<[string, string, Record<string, unknown>]> = [
  ["agent_create_incident", "incident.create", { title: "Chatbot", description: "Unsafe advice" }],
  ["agent_update_incident", "incident.edit", { incident_id: 42, status: "Closed" }],
  ["agent_update_incident_status", "incident.edit", { incident_id: 42, status: "Closed" }],
  ["agent_archive_incident", "incident.edit", { incident_id: 42 }],
  ["agent_delete_incident", "incident.delete", { incident_id: 42 }],
];

const writeQueries = [
  incidentUtils.createNewIncidentQuery,
  incidentUtils.updateIncidentByIdQuery,
  incidentUtils.archiveIncidentByIdQuery,
  incidentUtils.deleteIncidentByIdQuery,
] as unknown as AsyncMock[];

describe("advisor incident writes need the REST permission keys", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each(TOOLS)("%s is refused when proposed without %s", async (tool, permission, params) => {
    hasPermission.mockResolvedValue(false);

    const result = (await availableIncidentTools[tool]({ ...params, _userId: 9 }, 4)) as any;

    expect(result.success).toBe(false);
    expect(hasPermission).toHaveBeenCalledWith(4, 9, permission);
    expect(submit).not.toHaveBeenCalled();
  });

  it.each(TOOLS)(
    "%s is refused when run without %s and writes nothing",
    async (tool, permission, params) => {
      hasPermission.mockResolvedValue(false);

      const result = (await writeToolExecutors.get(tool)!({ ...params, _userId: 9 }, 4)) as any;

      expect(result).toEqual({ success: false, message: expect.stringContaining("Not done") });
      expect(hasPermission).toHaveBeenCalledWith(4, 9, permission);
      expect(startTransaction).not.toHaveBeenCalled();
      for (const query of writeQueries) expect(query).not.toHaveBeenCalled();
    },
  );

  it("checks the user who asked, not the approver, when the write runs", async () => {
    hasPermission.mockResolvedValue(false);

    await writeToolExecutors.get("agent_delete_incident")!(
      { incident_id: 42, _requesterId: 7, _userId: 1 },
      4,
    );

    expect(hasPermission).toHaveBeenCalledWith(4, 7, "incident.delete");
  });

  // The tools change details only (incident.edit); holding incident.approve
  // alone is not enough, and they never record approval.
  it("an approver without incident.edit cannot update through the Advisor", async () => {
    hasPermission.mockImplementation(
      async (_org: number, _user: number, key: string) => key === "incident.approve",
    );

    const result = (await writeToolExecutors.get("agent_update_incident")!(
      { incident_id: 42, status: "Closed", _userId: 9 },
      4,
    )) as any;

    expect(result.success).toBe(false);
    expect(incidentUtils.updateIncidentByIdQuery).not.toHaveBeenCalled();
  });

  it("an update never carries approval fields to the write", async () => {
    hasPermission.mockResolvedValue(true);
    const stored = storedIncident();
    stored.dataValues.status = "Open";
    stored.dataValues.approval_status = "Pending";
    (incidentUtils.getIncidentByIdQuery as unknown as AsyncMock).mockResolvedValue(stored);
    (incidentUtils.updateIncidentByIdQuery as unknown as AsyncMock).mockImplementation(
      async (_id: number, changed: any) => ({ id: 42, ...changed }),
    );

    await writeToolExecutors.get("agent_update_incident")!(
      {
        incident_id: 42,
        status: "Investigating",
        approval_status: "Approved",
        approved_by: "Someone else",
        _userId: 9,
      },
      4,
    );

    const changed = (incidentUtils.updateIncidentByIdQuery as unknown as AsyncMock).mock
      .calls[0][1];
    expect(changed).toEqual({ status: "Investigating" });
  });

  it("deletes when the user holds incident.delete", async () => {
    hasPermission.mockResolvedValue(true);
    (incidentUtils.deleteIncidentByIdQuery as unknown as AsyncMock).mockResolvedValue({
      ai_project: "Chatbot",
    });

    const result = await writeToolExecutors.get("agent_delete_incident")!(
      { incident_id: 42, _userId: 9 },
      4,
    );

    expect(result).toEqual({ deleted: true, incident_id: 42, ai_project: "Chatbot" });
  });
});
