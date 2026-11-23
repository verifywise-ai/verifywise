import { beforeEach, describe, expect, it, jest } from "@jest/globals";

jest.mock("../../../utils/projectDeletion.utils", () => ({
  deleteProjectWithSideEffects: jest.fn(),
}));
jest.mock("../../../utils/userPermission.utils", () => ({
  userHasPermission: jest.fn(),
  getUserRoleInOrganization: jest.fn(),
}));
jest.mock("../../../utils/project.utils", () => ({
  getProjectAccessQuery: jest.fn(),
  getUserProjects: jest.fn(),
  calculateProjectRisks: jest.fn(),
  lockProjectForDelete: jest.fn(),
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
jest.mock("../../../utils/user.utils", () => ({
  findUsersNotInOrganization: jest.fn(),
}));
jest.mock("../../../mcp/frameworks", () => ({
  resolveUseCaseFrameworkIds: jest.fn(),
}));
jest.mock("../../approval/approvalGateway", () => ({
  submitForApproval: jest.fn(),
}));
jest.mock("../../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));

import { sequelize } from "../../../database/db";
import { getUserRoleInOrganization, userHasPermission } from "../../../utils/userPermission.utils";
import {
  calculateProjectRisks,
  getCurrentProjectMembers,
  getProjectAccessQuery,
  getProjectByIdQuery,
  getUserProjects,
  lockProjectForDelete,
} from "../../../utils/project.utils";
import { findUsersNotInOrganization } from "../../../utils/user.utils";
import { createUseCaseService, updateUseCaseService } from "../../../services/useCase.service";
import {
  notifyUseCaseCreated,
  notifyUseCaseUpdated,
} from "../../../services/useCaseNotifications.service";
import { resolveUseCaseFrameworkIds } from "../../../mcp/frameworks";
import { submitForApproval } from "../../approval/approvalGateway";
import { availableUseCaseTools } from "../../functions/useCaseFunctions";
import { writeToolExecutors } from "../../confirmation/createWriteTool";
import { toolsDefinition } from "../../tools/useCaseTools";

type AsyncMock = jest.Mock<(...args: any[]) => Promise<any>>;
const mockTransaction = sequelize.transaction as unknown as AsyncMock;
const mockQuery = sequelize.query as unknown as AsyncMock;
const createService = createUseCaseService as unknown as AsyncMock;
const updateService = updateUseCaseService as unknown as AsyncMock;
const notifyCreated = notifyUseCaseCreated as unknown as AsyncMock;
const notifyUpdated = notifyUseCaseUpdated as unknown as AsyncMock;
const frameworksOf = resolveUseCaseFrameworkIds as unknown as AsyncMock;
const submit = submitForApproval as unknown as AsyncMock;
const listProjects = getUserProjects as unknown as AsyncMock;
const lockRow = lockProjectForDelete as unknown as AsyncMock;
const membersNow = getCurrentProjectMembers as unknown as AsyncMock;
const usersOutside = findUsersNotInOrganization as unknown as AsyncMock;

const transaction = { commit: jest.fn(), rollback: jest.fn() };
const EXISTING = { id: 12, owner: 5, status: "Not started", external_owner_email: null };
const CREATED = { id: 30, owner: 5, toJSON: () => ({ id: 30, status: "Not started" }) };
const APPROVAL = { request: { id: 1 }, autoApproved: false };

beforeEach(() => {
  jest.clearAllMocks();
  mockTransaction.mockResolvedValue(transaction);
  (userHasPermission as unknown as AsyncMock).mockResolvedValue(true);
  (getUserRoleInOrganization as unknown as AsyncMock).mockResolvedValue({ name: "Editor" });
  (getProjectAccessQuery as unknown as AsyncMock).mockResolvedValue("allowed");
  (getProjectByIdQuery as unknown as AsyncMock).mockResolvedValue(EXISTING);
  frameworksOf.mockResolvedValue({ ids: [], isOrganizational: false });
  createService.mockResolvedValue({ useCase: CREATED, frameworks: {}, approvalResult: APPROVAL });
  updateService.mockResolvedValue({ useCase: { id: 12, members: [] }, currentMembers: [] });
  submit.mockResolvedValue({ outcome: "pending", confirmationResult: { pending: true } });
  (calculateProjectRisks as unknown as AsyncMock).mockResolvedValue([]);
  lockRow.mockResolvedValue(true);
  membersNow.mockResolvedValue([]);
  usersOutside.mockResolvedValue([]);
});

/** U-M6: advisor creates and updates go through the use case service. */
describe("agent_create_use_case executor", () => {
  const execute = writeToolExecutors.get("agent_create_use_case")!;

  it("creates through the service as the requester, who owns it by default", async () => {
    frameworksOf.mockResolvedValue({ ids: [1], isOrganizational: false });

    const result = (await execute(
      {
        name: "Chat assistant",
        description: "Answers questions",
        risk_classification: "Limited risk",
        industry: "Retail",
        members: [8],
        framework_ids: [1],
        _userId: 9,
        _requesterId: 5,
      },
      4,
    )) as any;

    expect(result.success).toBe(true);
    expect(frameworksOf).toHaveBeenCalledWith([1]);
    const [input, ctx, tx] = createService.mock.calls[0] as [any, any, any];
    expect(input).toMatchObject({
      project_title: "Chat assistant",
      description: "Answers questions",
      ai_risk_classification: "Limited risk",
      target_industry: "Retail",
      owner: 5,
      members: [8],
      framework: [1],
      is_organizational: false,
    });
    // No status: the service's default ("Not started") applies.
    expect(input.status).toBeUndefined();
    expect(ctx).toEqual({ userId: 5, organizationId: 4, actorRole: "Editor" });
    expect(tx).toBe(transaction);
    expect(transaction.commit).toHaveBeenCalled();
    // The console's after-commit notices, as the requester.
    expect(notifyCreated).toHaveBeenCalledWith(CREATED, APPROVAL, 5, 4, expect.anything());
  });

  it("keeps a named owner", async () => {
    await execute({ name: "X", owner: 11, _userId: 9 }, 4);
    expect((createService.mock.calls[0][0] as any).owner).toBe(11);
  });

  it("reports a refused write and sends no notice", async () => {
    const { ValidationException } =
      await import("../../../domain.layer/exceptions/custom.exception");
    createService.mockRejectedValue(new ValidationException("Owner is not in this organization"));

    const result = (await execute({ name: "X", owner: 999, _userId: 9 }, 4)) as any;

    expect(result).toEqual({ success: false, message: "Owner is not in this organization" });
    expect(transaction.rollback).toHaveBeenCalled();
    expect(notifyCreated).not.toHaveBeenCalled();
  });

  it("refuses frameworks of both scopes before writing", async () => {
    frameworksOf.mockRejectedValue(new Error("A use case is either organization-wide or not"));
    const result = (await execute({ name: "X", framework_ids: [1, 2], _userId: 9 }, 4)) as any;
    expect(result.success).toBe(false);
    expect(createService).not.toHaveBeenCalled();
  });
});

describe.each([
  ["agent_update_use_case", { status: "On hold", goal: "Answer questions" }],
  ["agent_update_use_case_status", { status: "On hold" }],
])("%s executor", (toolName, fields) => {
  const execute = writeToolExecutors.get(toolName)!;

  it("updates through the service as the requester", async () => {
    const result = (await execute(
      { use_case_id: 12, ...fields, _userId: 9, _requesterId: 5 },
      4,
    )) as any;

    expect(result.success).toBe(true);
    const [id, input, existing, ctx] = updateService.mock.calls[0] as [any, any, any, any];
    expect(id).toBe(12);
    expect(input.status).toBe("On hold");
    expect(existing).toBe(EXISTING);
    expect(ctx).toEqual({ userId: 5, organizationId: 4, actorRole: "Editor" });
    expect(mockQuery).not.toHaveBeenCalled();
    expect(notifyUpdated).toHaveBeenCalledWith(
      EXISTING,
      { id: 12, members: [] },
      [],
      5,
      4,
      expect.anything(),
    );
  });

  it("falls back to the approver", async () => {
    await execute({ use_case_id: 12, ...fields, _userId: 9 }, 4);
    expect((updateService.mock.calls[0][3] as any).userId).toBe(9);
  });

  it("writes nothing without an acting user", async () => {
    await execute({ use_case_id: 12, ...fields }, 4);
    expect(updateService).not.toHaveBeenCalled();
  });

  it("answers not found when the use case is gone", async () => {
    (getProjectByIdQuery as unknown as AsyncMock).mockResolvedValue(null);
    const result = (await execute({ use_case_id: 12, ...fields, _userId: 9 }, 4)) as any;
    expect(result).toEqual({ success: false, message: "Use case #12 not found" });
    expect(updateService).not.toHaveBeenCalled();
  });

  it.each([
    ["Draft", "Not started"],
    ["active", "In progress"],
    ["In Progress", "In progress"],
    ["Archived", "Closed"],
  ])("maps the stored legacy status %s to %s", async (legacy, real) => {
    await execute({ use_case_id: 12, ...fields, status: legacy, _userId: 9 }, 4);
    expect((updateService.mock.calls[0][1] as any).status).toBe(real);
  });

  it("refuses a stored status that is not on any list", async () => {
    const result = (await execute(
      { use_case_id: 12, ...fields, status: "Paused", _userId: 9 },
      4,
    )) as any;
    expect(result.success).toBe(false);
    expect(result.message).toContain("Paused");
    expect(updateService).not.toHaveBeenCalled();
  });
});

describe("stored approvals with the old classification", () => {
  it("maps Unacceptable risk to Prohibited on update", async () => {
    await writeToolExecutors.get("agent_update_use_case")!(
      { use_case_id: 12, risk_classification: "Unacceptable risk", _userId: 9 },
      4,
    );
    expect((updateService.mock.calls[0][1] as any).ai_risk_classification).toBe("Prohibited");
  });

  it("maps Draft and Unacceptable risk on create", async () => {
    await writeToolExecutors.get("agent_create_use_case")!(
      { name: "X", status: "Draft", risk_classification: "unacceptable risk", _userId: 9 },
      4,
    );
    expect(createService.mock.calls[0][0]).toMatchObject({
      status: "Not started",
      ai_risk_classification: "Prohibited",
    });
  });
});

describe("filing a use case write", () => {
  it.each([
    ["agent_create_use_case", { name: "X", status: "Draft" }],
    ["agent_create_use_case", { name: "X", risk_classification: "Unacceptable risk" }],
    ["agent_create_use_case", { name: "X", members: "8" }],
    ["agent_update_use_case", { use_case_id: 12, status: "Active" }],
    ["agent_update_use_case_status", { use_case_id: 12, status: "Archived" }],
  ])("%s refuses %j before an approval is filed", async (tool, params) => {
    await expect(availableUseCaseTools[tool]({ ...params, _userId: 9 }, 4)).rejects.toThrow(
      "validation failed",
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it("files a real value as the list spells it", async () => {
    await availableUseCaseTools.agent_update_use_case_status(
      { use_case_id: 12, status: "in progress", _userId: 9 },
      4,
    );
    const { inputParams } = submit.mock.calls[0][0] as { inputParams: any };
    expect(inputParams.status).toBe("In progress");
  });

  it("offers only the real lists", () => {
    const enums = JSON.stringify(toolsDefinition);
    for (const old of ["Draft", "Active", "Archived", "Unacceptable risk", "In Progress"]) {
      expect(enums).not.toContain(`"${old}"`);
    }
  });
});

describe("get_use_case_executive_summary", () => {
  it("counts the real statuses", async () => {
    listProjects.mockResolvedValue([
      { id: 1, status: "Not started", ai_risk_classification: "Prohibited" },
      { id: 2, status: "In progress", ai_risk_classification: "High risk" },
      { id: 3, status: "In progress", ai_risk_classification: null },
      { id: 4, status: "Completed", ai_risk_classification: "Minimal risk" },
      { id: 5, status: "On hold", ai_risk_classification: null },
    ]);
    const summary = (await availableUseCaseTools.get_use_case_executive_summary(
      { _userId: 9 },
      4,
    )) as any;

    expect(summary).toMatchObject({
      totalUseCases: 5,
      notStartedUseCases: 1,
      inProgressUseCases: 2,
      underReviewUseCases: 0,
      completedUseCases: 1,
      highRiskUseCases: 2,
    });
    expect(summary.statusCounts["On hold"]).toBe(1);
  });
});

/** Review fixes on the advisor use case writes. */
describe("agent_add_member_to_use_case reads members under the row lock", () => {
  it("locks the use case, then reads its members in the same transaction", async () => {
    const order: string[] = [];
    lockRow.mockImplementation(async () => {
      order.push("lock");
      return true;
    });
    membersNow.mockImplementation(async () => {
      order.push("read");
      return [7];
    });

    const result = (await writeToolExecutors.get("agent_add_member_to_use_case")!(
      { use_case_id: 12, user_id: 20, _userId: 9 },
      4,
    )) as any;

    expect(result.success).toBe(true);
    expect(order).toEqual(["lock", "read"]);
    expect(lockRow).toHaveBeenCalledWith(12, 4, transaction);
    expect(membersNow).toHaveBeenCalledWith(12, 4, transaction);
    expect(updateService.mock.calls[0][1]).toEqual({ members: [7, 20] });
  });

  it("refuses an existing member and writes nothing", async () => {
    membersNow.mockResolvedValue([20]);
    const result = (await writeToolExecutors.get("agent_add_member_to_use_case")!(
      { use_case_id: 12, user_id: 20, _userId: 9 },
      4,
    )) as any;
    expect(result).toEqual({
      success: false,
      message: "User is already a member of this use case",
    });
    expect(updateService).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
  });
});

describe("repeated ids", () => {
  it("are written once", async () => {
    await writeToolExecutors.get("agent_create_use_case")!(
      { name: "X", members: [8, 8], framework_ids: [5, 5], _userId: 9 },
      4,
    );
    expect(frameworksOf).toHaveBeenCalledWith([5]);
    expect((createService.mock.calls[0][0] as any).members).toEqual([8]);
  });
});

describe("the console's title rules", () => {
  const long = "x".repeat(256);

  it.each([
    ["agent_create_use_case", {}],
    ["agent_create_use_case", { name: "   " }],
    ["agent_create_use_case", { name: long }],
    ["agent_update_use_case", { use_case_id: 12, name: "" }],
    ["agent_update_use_case", { use_case_id: 12, name: long }],
  ])("%s refuses %j at file time", async (tool, params) => {
    await expect(availableUseCaseTools[tool]({ ...params, _userId: 9 }, 4)).rejects.toThrow(
      "project_title",
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuses a blank title when a stored approval executes", async () => {
    const result = (await writeToolExecutors.get("agent_update_use_case")!(
      { use_case_id: 12, name: "  ", _userId: 9 },
      4,
    )) as any;
    expect(result.success).toBe(false);
    expect(updateService).not.toHaveBeenCalled();
  });

  it("refuses an over-long title when a stored approval executes", async () => {
    const result = (await writeToolExecutors.get("agent_create_use_case")!(
      { name: long, _userId: 9 },
      4,
    )) as any;
    expect(result.success).toBe(false);
    expect(createService).not.toHaveBeenCalled();
  });

  it("writes the title trimmed", async () => {
    await writeToolExecutors.get("agent_update_use_case")!(
      { use_case_id: 12, name: "  Renamed  ", _userId: 9 },
      4,
    );
    expect((updateService.mock.calls[0][1] as any).project_title).toBe("Renamed");
  });
});

describe("the owner is checked when filed", () => {
  it("refuses an owner that is not a user id", async () => {
    await expect(
      availableUseCaseTools.agent_create_use_case({ name: "X", owner: "abc", _userId: 9 }, 4),
    ).rejects.toThrow("owner");
    expect(submit).not.toHaveBeenCalled();
  });

  it("refuses an owner outside the organization", async () => {
    usersOutside.mockResolvedValue([99]);
    await expect(
      availableUseCaseTools.agent_create_use_case({ name: "X", owner: 99, _userId: 9 }, 4),
    ).rejects.toThrow("not in this organization");
    expect(usersOutside).toHaveBeenCalledWith([99], 4);
    expect(submit).not.toHaveBeenCalled();
  });
});

describe("executive summary status buckets", () => {
  it("counts no status as Not started and older labels as Other, adding up to the total", async () => {
    listProjects.mockResolvedValue([
      { id: 1, status: null },
      { id: 2, status: "Draft" },
      { id: 3, status: "In progress" },
    ]);
    const summary = (await availableUseCaseTools.get_use_case_executive_summary(
      { _userId: 9 },
      4,
    )) as any;
    expect(summary.notStartedUseCases).toBe(1);
    expect(summary.statusCounts.Other).toBe(1);
    const sum = Object.values(summary.statusCounts as Record<string, number>).reduce(
      (a, b) => a + b,
      0,
    );
    expect(sum).toBe(summary.totalUseCases);
  });
});

describe("fetch_use_cases filters that are not text", () => {
  it.each([{ status: 5 }, { ai_risk_classification: { a: 1 } }])(
    "%j matches nothing instead of failing",
    async (filter) => {
      listProjects.mockResolvedValue([{ id: 1, status: "In progress" }]);
      await expect(
        availableUseCaseTools.fetch_use_cases({ ...filter, _userId: 9 }, 4),
      ).resolves.toEqual([]);
    },
  );
});
