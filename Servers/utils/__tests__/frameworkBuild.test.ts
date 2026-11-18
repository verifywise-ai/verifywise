/**
 * Every framework picked for a use case is built through frameworkAdditionMap:
 * at creation (createUseCaseService step 3) and after approval
 * (createPendingFrameworksForApprovedUseCase). Before this, only ids 1-4 were
 * built, so a bundled framework such as HIPAA was attached with nothing behind
 * it and could not be added again.
 *
 * The builders and the database are mocked; the integration test
 * useCaseBundledFrameworks.test.ts checks the rows against Postgres.
 */

const mockBuilders: Record<number, jest.Mock> = {
  1: jest.fn().mockResolvedValue({ eu: true }),
  2: jest.fn().mockResolvedValue({ iso42001: true }),
  5: jest.fn().mockResolvedValue({ l2Rows: 3, l3Rows: 0 }),
  24: jest.fn().mockResolvedValue({ l2Rows: 35, l3Rows: 0 }),
};

jest.mock("../../types/framework.type", () => ({
  frameworkAdditionMap: mockBuilders,
  frameworkDeletionMap: {},
  frameworkFilesDeletionSourceMap: {},
}));
jest.mock("../../database/db", () => ({
  sequelize: { query: jest.fn(), transaction: jest.fn() },
}));
jest.mock("../../advisor/aiActions", () => ({ executeAiAction: jest.fn() }));
jest.mock("../logger/fileLogger", () => ({
  __esModule: true,
  default: { info: jest.fn(), error: jest.fn() },
  logStructured: jest.fn(),
}));
jest.mock("../lifecycle.utils", () => ({
  releaseUseCaseFromReview: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("../project.utils", () => ({
  createNewProjectQuery: jest.fn(),
  canViewProjectQuery: jest.fn(),
  ensureProjectMemberQuery: jest.fn(),
  getCurrentProjectMembers: jest.fn(),
  keepPreviousOwnerAsMemberQuery: jest.fn(),
  updateProjectByIdQuery: jest.fn(),
}));
jest.mock("../useCaseChangeHistory.utils", () => ({
  recordMultipleFieldChanges: jest.fn(),
  recordUseCaseCreation: jest.fn(),
  trackUseCaseChanges: jest.fn(),
}));
jest.mock("../../services/projects/approvalRequest.service", () => ({
  createUseCaseApprovalRequest: jest.fn().mockResolvedValue(null),
  // Creation checks the picked workflow before saving; treat it as usable.
  getUsableUseCaseWorkflow: jest.fn().mockResolvedValue({ workflow: { id: 9 } }),
}));

import { sequelize } from "../../database/db";
import { createNewProjectQuery } from "../project.utils";
import { createUseCaseService } from "../../services/useCase.service";
import { createPendingFrameworksForApprovedUseCase } from "../approvalRequest.utils";
import { frameworkResultKey, hasFrameworkBuilder } from "../framework.utils";
import { ValidationException } from "../../domain.layer/exceptions/custom.exception";

const mockQuery = sequelize.query as unknown as jest.Mock;
const mockCreate = createNewProjectQuery as unknown as jest.Mock;
const transaction = {} as any;
const ctx = { userId: 7, organizationId: 3 };

const createdUseCase = (approvalWorkflowId: number | null = null) =>
  ({
    id: 42,
    project_title: "Claims triage",
    owner: 7,
    approval_workflow_id: approvalWorkflowId,
    dataValues: { members: [] },
  }) as any;

beforeEach(() => {
  jest.clearAllMocks();
});

describe("frameworkResultKey", () => {
  it("keeps the historical keys for the core frameworks", () => {
    expect([1, 2, 3, 4].map(frameworkResultKey)).toEqual([
      "eu",
      "iso42001",
      "iso27001",
      "nist_ai_rmf",
    ]);
  });

  it("uses the structure key for a bundled framework", () => {
    expect(frameworkResultKey(24)).toBe("hipaa");
    expect(frameworkResultKey(5)).toBe("soc2");
  });
});

describe("createUseCaseService builds every picked framework", () => {
  it("builds a bundled framework alongside a core one", async () => {
    mockCreate.mockResolvedValue(createdUseCase());

    const { frameworks } = await createUseCaseService(
      { project_title: "Claims triage", owner: 7, framework: [1, 24] },
      ctx,
      transaction,
    );

    expect(mockBuilders[1]).toHaveBeenCalledWith(42, undefined, 3, transaction);
    expect(mockBuilders[24]).toHaveBeenCalledWith(42, undefined, 3, transaction);
    expect(frameworks).toEqual({ eu: { eu: true }, hipaa: { l2Rows: 35, l3Rows: 0 } });
  });

  it("passes enable_ai_data_insertion to bundled builders as to core ones", async () => {
    mockCreate.mockResolvedValue(createdUseCase());

    await createUseCaseService(
      { project_title: "P", owner: 7, framework: [2, 5], enable_ai_data_insertion: true },
      ctx,
      transaction,
    );

    expect(mockBuilders[2]).toHaveBeenCalledWith(42, true, 3, transaction);
    expect(mockBuilders[5]).toHaveBeenCalledWith(42, true, 3, transaction);
  });

  it("builds nothing while an approval workflow holds the frameworks", async () => {
    mockCreate.mockResolvedValue(createdUseCase(9));

    const { frameworks } = await createUseCaseService(
      { project_title: "P", owner: 7, framework: [1, 24], approval_workflow_id: 9 },
      ctx,
      transaction,
    );

    expect(mockBuilders[1]).not.toHaveBeenCalled();
    expect(mockBuilders[24]).not.toHaveBeenCalled();
    expect(frameworks).toEqual({});
  });

  it("refuses a framework with no builder before writing anything", async () => {
    expect(hasFrameworkBuilder(99)).toBe(false);

    await expect(
      createUseCaseService({ project_title: "P", owner: 7, framework: [1, 99] }, ctx, transaction),
    ).rejects.toMatchObject({
      constructor: ValidationException,
      metadata: expect.objectContaining({ field: "framework", value: 99 }),
    });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockBuilders[1]).not.toHaveBeenCalled();
  });
});

describe("createPendingFrameworksForApprovedUseCase builds every pending framework", () => {
  const linkInserts = () =>
    mockQuery.mock.calls
      .filter(([sql]) => String(sql).includes("INSERT INTO projects_frameworks"))
      .map(([, options]) => options.replacements.framework_id);

  it("links and builds core and bundled frameworks, and skips one with no builder", async () => {
    mockQuery
      .mockResolvedValueOnce([
        { id: 42, pending_frameworks: [1, 24, 99], enable_ai_data_insertion: true },
      ])
      .mockImplementation(async (sql: string) =>
        String(sql).includes("INSERT INTO projects_frameworks") ? [[{ id: 500 }], 1] : [[]],
      );

    await createPendingFrameworksForApprovedUseCase(42, 3, transaction, 7);

    expect(linkInserts()).toEqual([1, 24]);
    expect(mockBuilders[1]).toHaveBeenCalledWith(42, true, 3, transaction);
    expect(mockBuilders[24]).toHaveBeenCalledWith(42, true, 3, transaction);
    const clear = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("SET pending_frameworks = NULL"),
    );
    expect(clear).toBeDefined();
  });

  it("neither fails nor builds again a framework attached since the request was made", async () => {
    mockQuery
      .mockResolvedValueOnce([
        { id: 42, pending_frameworks: [24], enable_ai_data_insertion: false },
      ])
      // ON CONFLICT DO NOTHING: the link already exists, no row returned.
      .mockResolvedValue([[], 0]);

    await createPendingFrameworksForApprovedUseCase(42, 3, transaction, 7);

    expect(linkInserts()).toEqual([24]);
    expect(mockBuilders[24]).not.toHaveBeenCalled();
    const clear = mockQuery.mock.calls.find(([sql]) =>
      String(sql).includes("SET pending_frameworks = NULL"),
    );
    expect(clear).toBeDefined();
  });

  it("does nothing when no frameworks are pending", async () => {
    mockQuery.mockResolvedValueOnce([{ id: 42, pending_frameworks: null }]);

    await createPendingFrameworksForApprovedUseCase(42, 3, transaction);

    expect(linkInserts()).toEqual([]);
    expect(mockBuilders[1]).not.toHaveBeenCalled();
  });
});
