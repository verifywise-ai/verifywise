import { beforeEach, describe, expect, it, jest } from "@jest/globals";

// The Advisor's incident create, archive and delete use the console's write
// paths (services/incidentManagement.service.ts).

jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../approval/approvalGateway", () => ({ submitForApproval: jest.fn() }));
jest.mock("../../../utils/userPermission.utils", () => ({
  userHasPermission: jest.fn(async () => true),
}));
jest.mock("../../../utils/incidentManagement.utils", () => ({
  ...(jest.requireActual("../../../utils/incidentManagement.utils") as object),
  getIncidentApproverName: jest.fn(async () => "Rita Requester"),
}));
jest.mock("../../../services/incidentManagement.service", () => ({
  ...(jest.requireActual("../../../services/incidentManagement.service") as object),
  createIncident: jest.fn(),
  setIncidentArchived: jest.fn(),
  deleteIncident: jest.fn(),
}));

import { writeToolExecutors } from "../../confirmation/createWriteTool";
import "../../functions/incidentFunctions";
import {
  createIncident,
  deleteIncident,
  IncidentCreateValidationError,
  setIncidentArchived,
} from "../../../services/incidentManagement.service";

type AsyncMock = jest.Mock<(...args: any[]) => Promise<any>>;
const mockCreate = createIncident as unknown as AsyncMock;
const mockArchive = setIncidentArchived as unknown as AsyncMock;
const mockDelete = deleteIncident as unknown as AsyncMock;

const run = (tool: string, params: Record<string, unknown>) =>
  writeToolExecutors.get(tool)!(params, 4) as Promise<any>;

describe("agent_create_incident", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCreate.mockResolvedValue({
      id: 77,
      incident_id: "INC-77",
      ai_project: "Chatbot",
      project_id: 12,
      status: "Open",
    });
  });

  it("creates through the shared create path with the requested use case", async () => {
    const result = await run("agent_create_incident", {
      title: "Chatbot",
      description: "Gave unsafe advice",
      severity: "Very serious",
      project_id: 12,
      _requesterId: 7,
      _userId: 9,
    });

    expect(mockCreate).toHaveBeenCalledWith(
      4,
      expect.objectContaining({
        ai_project: "Chatbot",
        description: "Gave unsafe advice",
        severity: "Very serious",
        project_id: 12,
        reporter: "Rita Requester",
        status: "Open",
      }),
      { userId: 9, canApprove: false, changedBySystem: false },
    );
    expect(result).toEqual(expect.objectContaining({ id: 77, project_id: 12 }));
  });

  it("leaves project_id out when the tool call has none", async () => {
    await run("agent_create_incident", { title: "Chatbot", description: "Gave unsafe advice" });

    expect(mockCreate.mock.calls[0][1]).not.toHaveProperty("project_id");
    // No executing user: history is recorded as the system.
    expect(mockCreate.mock.calls[0][2]).toEqual({
      userId: null,
      canApprove: false,
      changedBySystem: true,
    });
  });

  it("reports validation messages as the tool error", async () => {
    mockCreate.mockRejectedValue(
      new IncidentCreateValidationError([
        {
          field: "project_id",
          message: "project_id does not reference an entity in your organization",
          code: "INVALID_REFERENCE",
        },
      ]),
    );

    await expect(
      run("agent_create_incident", {
        title: "Chatbot",
        description: "Gave unsafe advice",
        project_id: 999,
        _userId: 9,
      }),
    ).rejects.toThrow("project_id does not reference an entity in your organization");
  });
});

describe("agent_archive_incident", () => {
  beforeEach(() => jest.clearAllMocks());

  it("archives through the shared update path", async () => {
    mockArchive.mockResolvedValue({ id: 42, ai_project: "Chatbot" });

    const result = await run("agent_archive_incident", { incident_id: 42, _userId: 9 });

    expect(mockArchive).toHaveBeenCalledWith(4, 42, true, 9, { changedBySystem: false });
    expect(result).toEqual({ id: 42, ai_project: "Chatbot", archived: true });
  });

  it("fails for a missing incident", async () => {
    mockArchive.mockResolvedValue(null);
    await expect(run("agent_archive_incident", { incident_id: 404, _userId: 9 })).rejects.toThrow(
      "Incident #404 not found",
    );
  });
});

describe("agent_delete_incident", () => {
  beforeEach(() => jest.clearAllMocks());

  it("deletes through the shared delete path", async () => {
    mockDelete.mockResolvedValue({ id: 42, ai_project: "Chatbot" });

    const result = await run("agent_delete_incident", { incident_id: 42, _userId: 9 });

    expect(mockDelete).toHaveBeenCalledWith(4, 42, 9, { changedBySystem: false });
    expect(result).toEqual({ deleted: true, incident_id: 42, ai_project: "Chatbot" });
  });

  it("reports deleted: false for a missing incident", async () => {
    mockDelete.mockResolvedValue(null);

    const result = await run("agent_delete_incident", { incident_id: 404, _userId: 9 });

    expect(result).toEqual(expect.objectContaining({ deleted: false, incident_id: 404 }));
  });
});
