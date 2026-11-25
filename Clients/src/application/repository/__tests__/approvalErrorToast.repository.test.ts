const mockPost = vi.fn();
const mockPut = vi.fn();
const mockPatch = vi.fn();
vi.mock("../../../infrastructure/api/networkServices", () => ({
  apiServices: {
    post: (...args: unknown[]) => mockPost(...args),
    put: (...args: unknown[]) => mockPut(...args),
    patch: (...args: unknown[]) => mockPatch(...args),
  },
}));

import { saveApprovalWorkflow } from "../approvalWorkflow.repository";
import { updateProject } from "../project.repository";
import type { ApprovalWorkflowFormData } from "../../utils/approvalWorkflowBody";

const formData = {
  workflow_title: "Model risk review",
  entity: 1,
  steps: [],
} as unknown as ApprovalWorkflowFormData;

// Both callers of saveApprovalWorkflow (the Approval workflows page and the
// in-place create on the use case screens) show a failed save in the workflow
// modal, so the global error toast would show it a second time.
describe("saveApprovalWorkflow error toast", () => {
  beforeEach(() => {
    mockPost.mockReset().mockResolvedValue({ data: { data: { id: 3 } } });
    mockPut.mockReset().mockResolvedValue({ data: { data: { id: 3 } } });
  });

  it("skips the global toast on create", async () => {
    await saveApprovalWorkflow({ formData });
    expect(mockPost).toHaveBeenCalledWith("/approval-workflows", expect.any(Object), {
      suppressGlobalErrorToast: true,
    });
  });

  it("skips the global toast on update", async () => {
    await saveApprovalWorkflow({ id: 3, formData });
    expect(mockPut).toHaveBeenCalledWith("/approval-workflows/3", expect.any(Object), {
      suppressGlobalErrorToast: true,
    });
  });
});

describe("updateProject error toast", () => {
  beforeEach(() => {
    mockPatch.mockReset().mockResolvedValue({ data: {} });
  });

  it("skips the global toast only when the caller asks", async () => {
    await updateProject({
      id: 7,
      body: { approval_workflow_id: 3 },
      suppressGlobalErrorToast: true,
    });
    expect(mockPatch).toHaveBeenLastCalledWith(
      "/v1/projects/7",
      { approval_workflow_id: 3 },
      { suppressGlobalErrorToast: true },
    );

    await updateProject({ id: 7, body: { project_title: "x" } });
    expect(mockPatch).toHaveBeenLastCalledWith("/v1/projects/7", { project_title: "x" });
  });
});
