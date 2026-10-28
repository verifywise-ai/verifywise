import { describe, it, expect, jest, beforeEach } from "@jest/globals";

jest.mock("../../database/db", () => ({
  sequelize: { transaction: jest.fn(), query: jest.fn() },
}));
jest.mock("../../utils/approvalRequest.utils", () => ({
  hasPendingApprovalQuery: jest.fn<any>().mockResolvedValue(false),
  getApprovalStatusQuery: jest.fn<any>().mockResolvedValue(null),
}));
jest.mock("../../utils/project.utils", () => ({
  getAllProjectsQuery: jest.fn(),
  getProjectByIdQuery: jest.fn(),
  calculateProjectRisks: jest.fn(),
}));
jest.mock("../../services/useCase.service", () => ({
  createUseCaseService: jest.fn(),
  updateUseCaseService: jest.fn(),
}));
jest.mock("../../services/inAppNotification.service", () => ({
  notifyUserAssigned: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../../utils/user.utils", () => ({
  getUserByIdQuery: jest.fn(),
}));
jest.mock("../../utils/logger/fileLogger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("../scope", () => ({
  requireOrganization: jest.fn<any>().mockResolvedValue(undefined),
}));
jest.mock("../frameworks", () => ({
  resolveUseCaseFrameworks: jest.fn(),
}));

import { sequelize } from "../../database/db";
import {
  calculateProjectRisks,
  getAllProjectsQuery,
  getProjectByIdQuery,
} from "../../utils/project.utils";
import { createUseCaseService, updateUseCaseService } from "../../services/useCase.service";
import { notifyUserAssigned } from "../../services/inAppNotification.service";
import { getUserByIdQuery } from "../../utils/user.utils";
import { getApprovalStatusQuery, hasPendingApprovalQuery } from "../../utils/approvalRequest.utils";
import { requireOrganization } from "../scope";
import { resolveUseCaseFrameworks } from "../frameworks";
import { useCaseTools } from "../tools/useCases";

const CALLER = { userId: 7, organizationId: null };

const tool = (name: string) => {
  const found = useCaseTools.find((t) => t.name === name);
  if (!found) throw new Error(`no tool named ${name}`);
  return found;
};

/** Parse the JSON payload a tool returns. */
const payload = (res: any) => JSON.parse(res.content[0].text);

const mockTransaction = { commit: jest.fn(), rollback: jest.fn() };
const mockCreate = createUseCaseService as unknown as jest.Mock;
const mockUpdate = updateUseCaseService as unknown as jest.Mock;
const mockGetById = getProjectByIdQuery as unknown as jest.Mock;
const mockResolve = resolveUseCaseFrameworks as unknown as jest.Mock;
const mockNotify = notifyUserAssigned as unknown as jest.Mock;

/** A ProjectModel is returned; only toJSON and the read fields matter here. */
function builtUseCase(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 11,
    project_title: "Screening platform",
    owner: 4,
    description: "desc",
    ...overrides,
  };
  return { ...row, toJSON: () => row, dataValues: { owner_name: "Ada Lovelace" } };
}

beforeEach(() => {
  jest.clearAllMocks();
  (sequelize.transaction as unknown as jest.Mock).mockResolvedValue(mockTransaction as never);
  (hasPendingApprovalQuery as unknown as jest.Mock).mockResolvedValue(false as never);
  (getApprovalStatusQuery as unknown as jest.Mock).mockResolvedValue(null as never);
  mockResolve.mockResolvedValue({ ids: [], isOrganizational: false } as never);
  (getUserByIdQuery as unknown as jest.Mock).mockResolvedValue({
    id: 7,
    name: "Grace",
    surname: "Hopper",
  } as never);
});

describe("list_use_cases", () => {
  it("lifts the project-membership filter so the whole portfolio comes back", async () => {
    (getAllProjectsQuery as unknown as jest.Mock).mockResolvedValue([
      { id: 1 },
      { id: 2 },
    ] as never);

    const res = await tool("list_use_cases").handler({ organizationId: 3 }, CALLER);

    expect(getAllProjectsQuery).toHaveBeenCalledWith({ userId: 7, role: "SuperAdmin" }, 3);
    expect(payload(res)).toEqual({
      organizationId: 3,
      count: 2,
      useCases: [{ id: 1 }, { id: 2 }],
    });
  });

  it("checks the organization before reading", async () => {
    (getAllProjectsQuery as unknown as jest.Mock).mockResolvedValue([] as never);
    await tool("list_use_cases").handler({ organizationId: 3 }, CALLER);
    expect(requireOrganization).toHaveBeenCalledWith(3);
  });
});

describe("get_use_case", () => {
  it("returns the owner name the query attaches outside the model shape", async () => {
    mockGetById.mockResolvedValue(builtUseCase() as never);
    (calculateProjectRisks as unknown as jest.Mock).mockResolvedValue([
      { risk_level_autocalculated: "High risk", count: "2" },
    ] as never);

    const res = await tool("get_use_case").handler({ organizationId: 3, useCaseId: 11 }, CALLER);

    expect(payload(res).useCase.owner_name).toBe("Ada Lovelace");
    expect(payload(res).risksByLevel).toEqual([
      { risk_level_autocalculated: "High risk", count: "2" },
    ]);
  });

  it("reports whether the use case is awaiting approval", async () => {
    mockGetById.mockResolvedValue(builtUseCase() as never);
    (calculateProjectRisks as unknown as jest.Mock).mockResolvedValue([] as never);
    (hasPendingApprovalQuery as unknown as jest.Mock).mockResolvedValue(true as never);
    (getApprovalStatusQuery as unknown as jest.Mock).mockResolvedValue("pending" as never);

    const res = await tool("get_use_case").handler({ organizationId: 3, useCaseId: 11 }, CALLER);

    expect(payload(res).useCase).toMatchObject({
      has_pending_approval: true,
      approval_status: "pending",
    });
  });

  it("says which organization was searched when the use case is not there", async () => {
    mockGetById.mockResolvedValue(null as never);

    await expect(
      tool("get_use_case").handler({ organizationId: 3, useCaseId: 11 }, CALLER),
    ).rejects.toThrow("No use case with id 11 in organization 3.");
  });
});

describe("create_use_case", () => {
  const args = {
    organizationId: 3,
    title: "Screening platform",
    owner: 4,
    goal: "Screen candidates",
    startDate: "2026-10-21",
    geography: "North America",
    frameworks: ["ISO 42001"],
  };

  it("maps the geography name to the id the column stores", async () => {
    mockCreate.mockResolvedValue({ useCase: builtUseCase(), frameworks: {} } as never);

    await tool("create_use_case").handler(args, CALLER);

    expect(mockCreate.mock.calls[0][0]).toMatchObject({ geography: 3 });
  });

  /** The bug: the scope has to follow the frameworks or the insert refuses them. */
  it("sets is_organizational from the frameworks' own scope", async () => {
    mockResolve.mockResolvedValue({ ids: [2], isOrganizational: true } as never);
    mockCreate.mockResolvedValue({
      useCase: builtUseCase(),
      frameworks: { iso42001: {} },
    } as never);

    await tool("create_use_case").handler(args, CALLER);

    expect(mockResolve).toHaveBeenCalledWith(["ISO 42001"]);
    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      framework: [2],
      is_organizational: true,
    });
  });

  it("resolves the frameworks before opening a transaction", async () => {
    mockResolve.mockRejectedValue(new Error("mixed scopes") as never);

    await expect(tool("create_use_case").handler(args, CALLER)).rejects.toThrow("mixed scopes");
    expect(sequelize.transaction).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("passes the use case classification fields through", async () => {
    mockCreate.mockResolvedValue({ useCase: builtUseCase(), frameworks: {} } as never);

    await tool("create_use_case").handler(
      {
        ...args,
        useCaseCategory: "Generative AI",
        useCasePurpose: "Summarise applications",
        useCaseAudience: "Recruiters",
        deploymentContext: "Internal web app",
      },
      CALLER,
    );

    expect(mockCreate.mock.calls[0][0]).toMatchObject({
      use_case_category: "Generative AI",
      use_case_purpose: "Summarise applications",
      use_case_audience: "Recruiters",
      deployment_context: "Internal web app",
    });
  });

  it("attributes the write to the authenticated caller", async () => {
    mockCreate.mockResolvedValue({ useCase: builtUseCase(), frameworks: {} } as never);

    await tool("create_use_case").handler(args, CALLER);

    expect(mockCreate.mock.calls[0][1]).toEqual({ userId: 7, organizationId: 3 });
  });

  it("separates the frameworks attached from those that built structures", async () => {
    mockResolve.mockResolvedValue({ ids: [4, 5], isOrganizational: true } as never);
    mockCreate.mockResolvedValue({
      useCase: builtUseCase(),
      frameworks: { nist_ai_rmf: {} },
    } as never);

    const res = await tool("create_use_case").handler(
      { ...args, frameworks: ["NIST AI RMF", "SOC 2 Type II Framework"] },
      CALLER,
    );

    expect(payload(res).frameworksAttached).toEqual(["NIST AI RMF", "SOC 2 Type II Framework"]);
    expect(payload(res).frameworksWithStructures).toEqual(["nist_ai_rmf"]);
  });

  it("commits and tells the owner the use case is theirs", async () => {
    mockCreate.mockResolvedValue({ useCase: builtUseCase(), frameworks: {} } as never);

    await tool("create_use_case").handler(args, CALLER);

    expect(mockTransaction.commit).toHaveBeenCalled();
    expect(mockNotify).toHaveBeenCalledWith(
      3,
      4,
      expect.objectContaining({ entityType: "project", entityId: 11, roleType: "Owner" }),
      "Grace Hopper",
      expect.any(String),
      { description: "desc" },
    );
  });

  it("rolls back and reports the failure when the write fails", async () => {
    mockCreate.mockRejectedValue(new Error("owner is not in this organization") as never);

    await expect(tool("create_use_case").handler(args, CALLER)).rejects.toThrow(
      "owner is not in this organization",
    );
    expect(mockTransaction.rollback).toHaveBeenCalled();
    expect(mockTransaction.commit).not.toHaveBeenCalled();
    expect(mockNotify).not.toHaveBeenCalled();
  });
});

describe("update_use_case", () => {
  beforeEach(() => {
    // Read twice: once for the existence check, once for the re-read after
    // commit that the tool actually answers with.
    mockGetById.mockResolvedValue(builtUseCase({ project_title: "New" }) as never);
    mockUpdate.mockResolvedValue({
      useCase: { id: 11, project_title: "New", owner: 4, members: [] },
      currentMembers: [],
    } as never);
  });

  it("sends only the fields given, so an absent one is left alone", async () => {
    await tool("update_use_case").handler(
      { organizationId: 3, useCaseId: 11, title: "New" },
      CALLER,
    );

    const sent = mockUpdate.mock.calls[0][1];
    expect(sent).toMatchObject({ project_title: "New", last_updated_by: 7 });
    expect(sent).not.toHaveProperty("status");
    expect(sent).not.toHaveProperty("members");
    expect(sent).not.toHaveProperty("goal");
  });

  it("accepts the fields the update query carries but the tool used to omit", async () => {
    await tool("update_use_case").handler(
      {
        organizationId: 3,
        useCaseId: 11,
        startDate: "2027-01-01",
        useCaseCategory: "Computer Vision",
        useCasePurpose: "Inspect parts",
        useCaseAudience: "Operators",
        deploymentContext: "Factory floor",
      },
      CALLER,
    );

    const sent = mockUpdate.mock.calls[0][1];
    expect(sent.start_date).toEqual(new Date("2027-01-01"));
    expect(sent).toMatchObject({
      use_case_category: "Computer Vision",
      use_case_purpose: "Inspect parts",
      use_case_audience: "Operators",
      deployment_context: "Factory floor",
    });
  });

  it("passes an empty member list through, so members can be cleared", async () => {
    await tool("update_use_case").handler(
      { organizationId: 3, useCaseId: 11, members: [] },
      CALLER,
    );

    expect(mockUpdate.mock.calls[0][1].members).toEqual([]);
  });

  it("refuses a call that would change nothing", async () => {
    await expect(
      tool("update_use_case").handler({ organizationId: 3, useCaseId: 11 }, CALLER),
    ).rejects.toThrow("Provide at least one field to update.");
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it("tells a new owner, and no one when the owner did not change", async () => {
    await tool("update_use_case").handler({ organizationId: 3, useCaseId: 11, owner: 9 }, CALLER);
    expect(mockNotify).toHaveBeenCalledWith(
      3,
      9,
      expect.objectContaining({ roleType: "Owner" }),
      "Grace Hopper",
      expect.any(String),
      expect.any(Object),
    );

    jest.clearAllMocks();
    mockGetById.mockResolvedValue(builtUseCase({ project_title: "New" }) as never);
    mockUpdate.mockResolvedValue({
      useCase: { id: 11, project_title: "New", owner: 4, members: [] },
      currentMembers: [],
    } as never);
    (hasPendingApprovalQuery as unknown as jest.Mock).mockResolvedValue(false as never);
    (getApprovalStatusQuery as unknown as jest.Mock).mockResolvedValue(null as never);

    // builtUseCase owns 4, so re-sending that owner is not a change.
    await tool("update_use_case").handler({ organizationId: 3, useCaseId: 11, owner: 4 }, CALLER);
    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("answers with the re-read row, in the same shape as get_use_case", async () => {
    const res = await tool("update_use_case").handler(
      { organizationId: 3, useCaseId: 11, title: "New" },
      CALLER,
    );

    // The model's toJSON shape plus the attached fields — not the raw column
    // values the update query hands back.
    expect(payload(res).useCase).toMatchObject({
      id: 11,
      project_title: "New",
      owner_name: "Ada Lovelace",
      has_pending_approval: false,
    });
  });

  it("reports the update when the use case is deleted before the re-read", async () => {
    mockGetById.mockResolvedValueOnce(builtUseCase() as never).mockResolvedValueOnce(null as never);

    const res = await tool("update_use_case").handler(
      { organizationId: 3, useCaseId: 11, title: "New" },
      CALLER,
    );

    expect(payload(res)).toEqual({
      useCaseId: 11,
      updated: true,
      note: "The update was applied, but the use case has since been deleted.",
    });
    expect(mockTransaction.commit).toHaveBeenCalled();
  });

  it("rolls back and says so when the row disappears mid-update", async () => {
    mockUpdate.mockResolvedValue({ useCase: null, currentMembers: [] } as never);

    await expect(
      tool("update_use_case").handler({ organizationId: 3, useCaseId: 11, title: "New" }, CALLER),
    ).rejects.toThrow("Use case 11 was deleted while it was being updated.");
    expect(mockTransaction.rollback).toHaveBeenCalled();
  });

  it("does not open a transaction for a use case that is not there", async () => {
    mockGetById.mockResolvedValue(null as never);

    await expect(
      tool("update_use_case").handler({ organizationId: 3, useCaseId: 11, title: "New" }, CALLER),
    ).rejects.toThrow("No use case with id 11 in organization 3.");
    expect(sequelize.transaction).not.toHaveBeenCalled();
  });
});
