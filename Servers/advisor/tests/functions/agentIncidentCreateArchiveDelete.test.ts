import { afterEach, beforeEach, describe, expect, it, jest } from "@jest/globals";

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
  // User 7 is a member of the organization; anyone else is not.
  getIncidentMemberName: jest.fn(async (userId: number) =>
    userId === 7 ? "Rita Requester" : null,
  ),
}));
jest.mock("../../../services/incidentManagement.service", () => ({
  ...(jest.requireActual("../../../services/incidentManagement.service") as object),
  createIncident: jest.fn(),
  setIncidentArchived: jest.fn(),
  deleteIncident: jest.fn(),
}));

import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { asyncLocalStorage } from "../../../utils/context/context";
import { REQUESTER_CLIENT_DATE_PARAM } from "../../approval/types";
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
        reporter_id: 7,
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

  it("reports as text only when the requester is not a member of the organization", async () => {
    await run("agent_create_incident", {
      title: "Chatbot",
      description: "Gave unsafe advice",
      _requesterId: 12,
      _userId: 9,
    });
    const input = mockCreate.mock.calls[0][1] as Record<string, unknown>;
    expect(input.reporter).toBe("User #12");
    expect(input).not.toHaveProperty("reporter_id");
  });

  describe("incident days", () => {
    // 20:00 on 2026-11-24 in Toronto: already 2026-11-25 in UTC. Only Date
    // is faked, so the promises still resolve.
    beforeEach(() => {
      jest.useFakeTimers({
        now: new Date("2026-11-25T01:00:00.000Z"),
        doNotFake: [
          "nextTick",
          "setImmediate",
          "clearImmediate",
          "setTimeout",
          "clearTimeout",
          "setInterval",
          "clearInterval",
          "queueMicrotask",
        ],
      });
    });
    afterEach(() => jest.useRealTimers());

    const createdDays = () => {
      const input = mockCreate.mock.calls[0][1] as Record<string, unknown>;
      return [input.occurred_date, input.date_detected];
    };

    it("uses the requester's local date sent with the request", async () => {
      await asyncLocalStorage.run({ clientDate: "2026-11-24" }, () =>
        run("agent_create_incident", { title: "Chatbot", description: "Gave unsafe advice" }),
      );
      expect(createdDays()).toEqual(["2026-11-24", "2026-11-24"]);
    });

    it("uses the requester's date captured when they asked, over the approver's", async () => {
      await asyncLocalStorage.run({ clientDate: "2026-11-25" }, () =>
        run("agent_create_incident", {
          title: "Chatbot",
          description: "Gave unsafe advice",
          [REQUESTER_CLIENT_DATE_PARAM]: "2026-11-23",
        }),
      );
      expect(createdDays()).toEqual(["2026-11-23", "2026-11-23"]);
    });

    it("ignores a captured requester date that is not a calendar date", async () => {
      await asyncLocalStorage.run({ clientDate: "2026-11-24" }, () =>
        run("agent_create_incident", {
          title: "Chatbot",
          description: "Gave unsafe advice",
          [REQUESTER_CLIENT_DATE_PARAM]: "2026-02-30",
        }),
      );
      expect(createdDays()).toEqual(["2026-11-24", "2026-11-24"]);
    });

    it("uses today in UTC without a client date, or with one that is not today anywhere", async () => {
      await run("agent_create_incident", { title: "Chatbot", description: "Gave unsafe advice" });
      await asyncLocalStorage.run({ clientDate: "2026-11-20" }, () =>
        run("agent_create_incident", { title: "Chatbot", description: "Gave unsafe advice" }),
      );
      expect(mockCreate.mock.calls.map((call) => (call[1] as any).occurred_date)).toEqual([
        "2026-11-25",
        "2026-11-25",
      ]);
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

  it("refuses a missing incident like the other refusals", async () => {
    mockDelete.mockResolvedValue(null);

    const result = await run("agent_delete_incident", { incident_id: 404, _userId: 9 });

    expect(result).toEqual({ success: false, message: "Incident #404 not found." });
  });
});
