/**
 * @fileoverview Use Case Approval Request Service Tests
 *
 * Tests for notifyUseCaseApprovalRequested — who gets told that a newly
 * created use case is waiting on them.
 *
 * @module services/projects/__tests__/approvalRequest.service
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";

// Mock dependencies BEFORE imports
jest.mock("../../inAppNotification.service", () => ({
  notifyApprovalRequested: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock("../../../utils/logger/fileLogger", () => ({
  logStructured: jest.fn(),
}));
jest.mock("../../../utils/user.utils", () => ({
  getUserByIdQuery: jest.fn(),
}));

jest.mock("../../../utils/approvalWorkflow.utils", () => ({
  getApprovalWorkflowByIdQuery: jest.fn(),
}));

jest.mock("../../../utils/approvalRequest.utils", () => ({
  createApprovalRequestQuery: jest.fn(),
  tryAutoApproveRequestQuery: jest.fn(),
}));

jest.mock("../../../utils/lifecycle.utils", () => ({
  moveUseCaseIntoReview: jest.fn(),
}));

import {
  createUseCaseApprovalRequest,
  notifyUseCaseApprovalRequested,
  UseCaseApprovalRequestResult,
} from "../approvalRequest.service";
import { notifyApprovalRequested } from "../../inAppNotification.service";
import { getUserByIdQuery } from "../../../utils/user.utils";
import { getApprovalWorkflowByIdQuery } from "../../../utils/approvalWorkflow.utils";
import { ValidationException } from "../../../domain.layer/exceptions/custom.exception";
import { moveUseCaseIntoReview } from "../../../utils/lifecycle.utils";
import {
  createApprovalRequestQuery,
  tryAutoApproveRequestQuery,
} from "../../../utils/approvalRequest.utils";

const mockNotify = notifyApprovalRequested as jest.MockedFunction<typeof notifyApprovalRequested>;
const mockGetUser = getUserByIdQuery as jest.MockedFunction<typeof getUserByIdQuery>;
const mockGetWorkflow = getApprovalWorkflowByIdQuery as jest.MockedFunction<
  typeof getApprovalWorkflowByIdQuery
>;
const mockCreateRequest = createApprovalRequestQuery as jest.MockedFunction<
  typeof createApprovalRequestQuery
>;
const mockTryAutoApprove = tryAutoApproveRequestQuery as jest.MockedFunction<
  typeof tryAutoApproveRequestQuery
>;

/** A workflow step as getApprovalWorkflowByIdQuery hands it over: approvers on the data values. */
function buildStep(stepNumber: number, approverIds: number[]): any {
  return {
    step_number: stepNumber,
    getDataValue: (key: string) =>
      key === "approvers" ? approverIds.map((approver_id) => ({ approver_id })) : undefined,
  };
}

function buildApproval(steps: any[]): UseCaseApprovalRequestResult {
  return {
    request: { id: 50, request_name: "Use Case: Fraud scoring" } as any,
    autoApproved: false,
    workflowTitle: "Use case sign-off",
    steps,
  };
}

const project = { id: 9, project_title: "Fraud scoring" } as any;

describe("createUseCaseApprovalRequest", () => {
  /**
   * getApprovalWorkflowByIdQuery maps raw SQL onto the model and hangs the steps
   * off setDataValue, so the @HasMany `steps` property stays undefined. Reading
   * the property instead of the data value silently created no request at all.
   */
  function buildWorkflow(steps: any[], overrides: Record<string, any> = {}): any {
    return {
      id: 1,
      workflow_title: "Use case sign-off",
      entity_type: "use_case",
      is_active: true,
      steps: undefined,
      getDataValue: (key: string) => (key === "steps" ? steps : undefined),
      ...overrides,
    };
  }

  const useCase = {
    id: 11,
    project_title: "Testing Project",
    owner: 2,
    approval_workflow_id: 1,
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCreateRequest.mockResolvedValue({
      id: 50,
      request_name: "Use Case: Testing Project",
      setDataValue: jest.fn(),
    } as any);
    mockTryAutoApprove.mockResolvedValue({ autoApproved: false } as any);
  });

  it("creates the request from steps held on the workflow data value", async () => {
    const steps = [buildStep(1, [7])];
    mockGetWorkflow.mockResolvedValue(buildWorkflow(steps));

    const result = await createUseCaseApprovalRequest(useCase, 2, 1, {} as any);

    expect(mockCreateRequest).toHaveBeenCalledWith(
      expect.objectContaining({ entity_type: "use_case", entity_id: 11 }),
      steps,
      1,
      expect.anything(),
    );
    expect(result).toEqual(expect.objectContaining({ workflowTitle: "Use case sign-off", steps }));
    // An open request puts a planned use case in review (#5187).
    expect(moveUseCaseIntoReview).toHaveBeenCalledWith(1, 11, 2, expect.anything());
  });

  // A workflow nobody can decide would park the use case's frameworks forever
  // (audit U-M2): each is a 400 on approval_workflow_id, and nothing is opened.
  it.each([
    ["missing or in another organization", () => null],
    ["without steps", () => buildWorkflow([])],
    ["with a step without approvers", () => buildWorkflow([buildStep(1, [7]), buildStep(2, [])])],
  ])("rejects a workflow %s", async (_label, workflow) => {
    mockGetWorkflow.mockResolvedValue(workflow() as any);

    const error = await createUseCaseApprovalRequest(useCase, 2, 1, {} as any).catch((e) => e);

    expect(error).toBeInstanceOf(ValidationException);
    expect(error.metadata).toEqual(expect.objectContaining({ field: "approval_workflow_id" }));
    expect(mockCreateRequest).not.toHaveBeenCalled();
    expect(moveUseCaseIntoReview).not.toHaveBeenCalled();
  });

  it("rejects a workflow that has been deleted", async () => {
    mockGetWorkflow.mockResolvedValue(buildWorkflow([buildStep(1, [7])], { is_active: false }));

    await expect(createUseCaseApprovalRequest(useCase, 2, 1, {} as any)).rejects.toThrow(
      ValidationException,
    );
    expect(mockCreateRequest).not.toHaveBeenCalled();
  });

  it("rejects a workflow defined for another entity type", async () => {
    mockGetWorkflow.mockResolvedValue(
      buildWorkflow([buildStep(1, [7])], { entity_type: "vendor" }),
    );

    await expect(createUseCaseApprovalRequest(useCase, 2, 1, {} as any)).rejects.toThrow(
      ValidationException,
    );
    expect(mockCreateRequest).not.toHaveBeenCalled();
  });

  // The caller already checked the workflow (create and update refuse an
  // unusable one before writing); loading it again was a second round trip.
  it("uses the workflow the caller already loaded instead of reading it again", async () => {
    const steps = [buildStep(1, [7])];
    const usable = { workflow: buildWorkflow(steps), steps };

    const result = await createUseCaseApprovalRequest(useCase, 2, 1, {} as any, usable);

    expect(mockGetWorkflow).not.toHaveBeenCalled();
    expect(mockCreateRequest).toHaveBeenCalledWith(
      expect.objectContaining({ workflow_id: 1 }),
      steps,
      1,
      expect.anything(),
    );
    expect(result).toEqual(expect.objectContaining({ workflowTitle: "Use case sign-off" }));
  });

  it("reads the workflow again when the one passed in is for another id", async () => {
    const steps = [buildStep(1, [7])];
    mockGetWorkflow.mockResolvedValue(buildWorkflow(steps));
    const stale = { workflow: buildWorkflow(steps, { id: 99 }), steps };

    await createUseCaseApprovalRequest(useCase, 2, 1, {} as any, stale);

    expect(mockGetWorkflow).toHaveBeenCalledWith(1, 1, expect.anything());
  });

  it("creates no request when the use case has no workflow", async () => {
    expect(
      await createUseCaseApprovalRequest(
        { ...useCase, approval_workflow_id: null },
        2,
        1,
        {} as any,
      ),
    ).toBeNull();
    expect(mockGetWorkflow).not.toHaveBeenCalled();
  });
});

describe("notifyUseCaseApprovalRequested", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ id: 1, name: "Ada", surname: "Lovelace" } as any);
  });

  it("notifies every approver on step 1", async () => {
    const approval = buildApproval([buildStep(1, [7, 8]), buildStep(2, [9])]);

    await notifyUseCaseApprovalRequested(project, approval, 1, 3);

    expect(mockNotify).toHaveBeenCalledTimes(2);
    expect(mockNotify).toHaveBeenCalledWith(
      3,
      7,
      {
        id: 9,
        name: "Use Case: Fraud scoring",
        workflowName: "Use case sign-off",
        stepNumber: 1,
        totalSteps: 2,
      },
      "Ada Lovelace",
      expect.any(String),
    );
    expect(mockNotify).toHaveBeenCalledWith(
      3,
      8,
      expect.anything(),
      "Ada Lovelace",
      expect.any(String),
    );
  });

  it("links the approver to the use case, not to the approval request", async () => {
    const approval = buildApproval([buildStep(1, [7])]);

    await notifyUseCaseApprovalRequested(project, approval, 1, 3);

    expect(mockNotify).toHaveBeenCalledWith(
      3,
      7,
      expect.objectContaining({ id: project.id }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("does not notify later steps — they are notified as the request advances", async () => {
    const approval = buildApproval([buildStep(1, [7]), buildStep(2, [8])]);

    await notifyUseCaseApprovalRequested(project, approval, 1, 3);

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      3,
      7,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("does not notify the requester about their own request", async () => {
    const approval = buildApproval([buildStep(1, [7, 1])]);

    await notifyUseCaseApprovalRequested(project, approval, 1, 3);

    expect(mockNotify).toHaveBeenCalledTimes(1);
    expect(mockNotify).toHaveBeenCalledWith(
      3,
      7,
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it("sends nothing, and looks up no requester, when step 1 has only the requester", async () => {
    const approval = buildApproval([buildStep(1, [1])]);

    await notifyUseCaseApprovalRequested(project, approval, 1, 3);

    expect(mockNotify).not.toHaveBeenCalled();
    expect(mockGetUser).not.toHaveBeenCalled();
  });

  it("sends nothing when the workflow has no step 1", async () => {
    const approval = buildApproval([buildStep(2, [7])]);

    await notifyUseCaseApprovalRequested(project, approval, 1, 3);

    expect(mockNotify).not.toHaveBeenCalled();
  });

  it("looks the requester up within the organization only", async () => {
    const approval = buildApproval([buildStep(1, [7])]);

    await notifyUseCaseApprovalRequested(project, approval, 1, 3);

    expect(mockGetUser).toHaveBeenCalledWith(1, null, 3);
  });

  it("falls back to a generic requester name when the user is gone", async () => {
    mockGetUser.mockResolvedValue(undefined as any);
    const approval = buildApproval([buildStep(1, [7])]);

    await notifyUseCaseApprovalRequested(project, approval, 1, 3);

    expect(mockNotify).toHaveBeenCalledWith(3, 7, expect.anything(), "Someone", expect.anything());
  });
});
