import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/project.utils", () => ({
  getUserProjects: jest.fn(),
  calculateProjectRisks: jest.fn(),
  lockProjectForDelete: jest.fn(),
  getProjectAccessQuery: jest.fn(),
  getProjectByIdQuery: jest.fn(),
  getCurrentProjectMembers: jest.fn(),
}));
jest.mock("../../../services/useCase.service", () => ({
  createUseCaseService: jest.fn(),
  updateUseCaseService: jest.fn(),
}));
jest.mock("../../../services/useCaseNotifications.service", () => ({
  notifyUseCaseCreated: jest.fn(),
  notifyUseCaseUpdated: jest.fn(),
}));
jest.mock("../../../utils/userPermission.utils", () => ({
  userHasPermission: jest.fn(),
  getUserRoleInOrganization: jest.fn(),
}));
jest.mock("../../../utils/user.utils", () => ({
  findUsersNotInOrganization: jest.fn(),
}));
jest.mock("../../../utils/projectDeletion.utils", () => ({
  deleteProjectWithSideEffects: jest.fn(),
}));
jest.mock("../../approval/approvalGateway", () => ({
  submitForApproval: jest.fn(),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import * as projectUtils from "../../../utils/project.utils";
import * as userPermission from "../../../utils/userPermission.utils";
import * as userUtils from "../../../utils/user.utils";
import { submitForApproval } from "../../approval/approvalGateway";
import { createUseCaseService, updateUseCaseService } from "../../../services/useCase.service";
import { sequelize } from "../../../database/db";
import { availableUseCaseTools } from "../../functions/useCaseFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { isAutoApprovable } from "../../approval/rules";

type AsyncMock = jest.Mock<(...args: any[]) => Promise<any>>;
const listProjects = projectUtils.getUserProjects as unknown as AsyncMock;
const projectRisks = projectUtils.calculateProjectRisks as unknown as AsyncMock;
const projectAccess = projectUtils.getProjectAccessQuery as unknown as AsyncMock;
const hasPermission = userPermission.userHasPermission as unknown as AsyncMock;
const roleOf = userPermission.getUserRoleInOrganization as unknown as AsyncMock;
const usersOutside = userUtils.findUsersNotInOrganization as unknown as AsyncMock;
const submit = submitForApproval as unknown as AsyncMock;
const mockQuery = sequelize.query as unknown as AsyncMock;
const mockTransaction = sequelize.transaction as unknown as AsyncMock;
const createService = createUseCaseService as unknown as AsyncMock;
const updateService = updateUseCaseService as unknown as AsyncMock;
const projectById = projectUtils.getProjectByIdQuery as unknown as AsyncMock;
const currentMembers = projectUtils.getCurrentProjectMembers as unknown as AsyncMock;
const lockRow = projectUtils.lockProjectForDelete as unknown as AsyncMock;

const EDITOR = { id: 3, name: "Editor", organizationId: null };
const VISIBLE = [
  { id: 1, uc_id: "UC-1", project_title: "Mine", status: "Draft", ai_risk_classification: null },
];

beforeEach(() => {
  jest.clearAllMocks();
  roleOf.mockResolvedValue(EDITOR);
  listProjects.mockResolvedValue(VISIBLE);
  projectRisks.mockResolvedValue([]);
  projectAccess.mockResolvedValue("allowed");
  hasPermission.mockResolvedValue(true);
  usersOutside.mockResolvedValue([]);
  mockQuery.mockResolvedValue([[{ id: 1 }]]);
  mockTransaction.mockResolvedValue({ commit: jest.fn(), rollback: jest.fn() });
  projectById.mockResolvedValue({ id: 12, owner: 5, external_owner_email: null });
  currentMembers.mockResolvedValue([]);
  lockRow.mockResolvedValue(true);
  updateService.mockResolvedValue({ useCase: { id: 12, members: [20] }, currentMembers: [] });
});

describe("advisor use case reads see what the user's use case list shows", () => {
  const READS = ["fetch_use_cases", "get_use_case_analytics", "get_use_case_executive_summary"];

  it.each(READS)("%s lists the use cases visible to the chatting user", async (tool) => {
    await availableUseCaseTools[tool]({ _userId: 9 }, 4);

    expect(roleOf).toHaveBeenCalledWith(4, 9);
    expect(listProjects).toHaveBeenCalledWith({ userId: 9, role: "Editor" }, 4);
  });

  it.each(READS)("%s never reads as an Admin on the user's behalf", async (tool) => {
    await availableUseCaseTools[tool]({ _userId: 9 }, 4);

    for (const [viewer] of listProjects.mock.calls) {
      expect(viewer).not.toMatchObject({ role: "Admin" });
    }
  });

  it.each(READS)("%s reads nothing with no user", async (tool) => {
    await availableUseCaseTools[tool]({}, 4);
    expect(listProjects).not.toHaveBeenCalled();
  });

  it.each(READS)("%s reads nothing for a user outside the organization", async (tool) => {
    roleOf.mockResolvedValue(undefined);
    await availableUseCaseTools[tool]({ _userId: 9 }, 4);
    expect(listProjects).not.toHaveBeenCalled();
  });

  it("fetch_use_cases returns only the visible use cases", async () => {
    const result = (await availableUseCaseTools.fetch_use_cases({ _userId: 9 }, 4)) as any[];
    expect(result.map((p) => p.id)).toEqual([1]);
  });

  it("get_use_case_analytics counts only the visible use cases", async () => {
    const result = (await availableUseCaseTools.get_use_case_analytics({ _userId: 9 }, 4)) as any;
    expect(result.totalUseCases).toBe(1);
  });
});

describe("advisor use case writes need the console's permission and use case access", () => {
  const EDITS: Array<[string, Record<string, unknown>]> = [
    ["agent_update_use_case", { use_case_id: 12, name: "Renamed" }],
    ["agent_update_use_case_status", { use_case_id: 12, status: "On hold" }],
    ["agent_add_member_to_use_case", { use_case_id: 12, user_id: 20 }],
  ];

  it.each(EDITS)("%s runs as the requester when there is one", async (tool, params) => {
    await writeToolExecutors.get(tool)!({ ...params, _userId: 9, _requesterId: 5 }, 4);

    expect(hasPermission).toHaveBeenCalledWith(4, 5, "useCase.edit");
    expect(projectAccess).toHaveBeenCalledWith(12, { userId: 5, role: "Editor" }, 4);
    expect(updateService).toHaveBeenCalledWith(
      12,
      expect.anything(),
      expect.anything(),
      { userId: 5, organizationId: 4, actorRole: "Editor" },
      expect.anything(),
    );
  });

  it.each(EDITS)("%s refuses without useCase.edit and writes nothing", async (tool, params) => {
    hasPermission.mockResolvedValue(false);

    const result = (await writeToolExecutors.get(tool)!({ ...params, _userId: 9 }, 4)) as any;

    expect(result.success).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(updateService).not.toHaveBeenCalled();
  });

  it.each(EDITS)(
    "%s refuses a use case the user cannot see and writes nothing",
    async (tool, params) => {
      projectAccess.mockResolvedValue("denied");

      const result = (await writeToolExecutors.get(tool)!({ ...params, _userId: 9 }, 4)) as any;

      expect(result).toEqual({
        success: false,
        message: "You do not have access to use case #12",
      });
      expect(mockQuery).not.toHaveBeenCalled();
      expect(updateService).not.toHaveBeenCalled();
    },
  );

  it.each(EDITS)(
    "%s answers not found for a use case outside the organization",
    async (tool, params) => {
      projectAccess.mockResolvedValue("not_found");

      const result = (await writeToolExecutors.get(tool)!({ ...params, _userId: 9 }, 4)) as any;

      expect(result).toEqual({ success: false, message: "Use case #12 not found" });
      expect(mockQuery).not.toHaveBeenCalled();
      expect(updateService).not.toHaveBeenCalled();
    },
  );

  it.each(EDITS)("%s refuses when no user is known", async (tool, params) => {
    const result = (await writeToolExecutors.get(tool)!(params, 4)) as any;

    expect(result.success).toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
    expect(updateService).not.toHaveBeenCalled();
  });

  it("agent_add_member_to_use_case adds the member through the use case service", async () => {
    currentMembers.mockResolvedValue([7]);

    const result = (await writeToolExecutors.get("agent_add_member_to_use_case")!(
      { use_case_id: 12, user_id: 20, _userId: 9 },
      4,
    )) as any;

    expect(result.success).toBe(true);
    // The full member list, as the console sends it, so history records it.
    expect(updateService).toHaveBeenCalledWith(
      12,
      { members: [7, 20] },
      expect.anything(),
      { userId: 9, organizationId: 4, actorRole: "Editor" },
      expect.anything(),
    );
    expect(mockQuery).not.toHaveBeenCalledWith(
      expect.stringContaining("INSERT INTO projects_members"),
      expect.anything(),
    );
  });

  it("agent_add_member_to_use_case leaves an existing member alone", async () => {
    currentMembers.mockResolvedValue([20]);

    const result = (await writeToolExecutors.get("agent_add_member_to_use_case")!(
      { use_case_id: 12, user_id: 20, _userId: 9 },
      4,
    )) as any;

    expect(result).toEqual({
      success: false,
      message: "User is already a member of this use case",
    });
    expect(updateService).not.toHaveBeenCalled();
  });

  it("agent_create_use_case refuses without useCase.edit", async () => {
    hasPermission.mockResolvedValue(false);

    const result = (await writeToolExecutors.get("agent_create_use_case")!(
      { name: "New", _userId: 9 },
      4,
    )) as any;

    expect(hasPermission).toHaveBeenCalledWith(4, 9, "useCase.edit");
    expect(result.success).toBe(false);
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(createService).not.toHaveBeenCalled();
  });
});

describe("adding a member to a use case needs a person's approval", () => {
  it("is submitted as a warning, which is never auto-approved", async () => {
    submit.mockResolvedValue({ outcome: "pending", confirmationResult: { pending: true } });

    await availableUseCaseTools.agent_add_member_to_use_case(
      { use_case_id: 12, user_id: 20, _userId: 9 },
      4,
    );

    const { riskLevel } = submit.mock.calls[0][0] as { riskLevel: string };
    expect(riskLevel).toBe("warning");
    expect(isAutoApprovable({ riskLevel } as any)).toBe(false);
  });
});
