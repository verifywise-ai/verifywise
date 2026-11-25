import { vi } from "vitest";
import { useState } from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";

let mockWorkflows: Array<{ id: number; workflow_title: string; entity_type: string }> = [];
const mockSave = vi.fn();
vi.mock("../../../../application/repository/approvalWorkflow.repository", () => ({
  getApprovalWorkflowsByEntityType: () => Promise.resolve(mockWorkflows),
  saveApprovalWorkflow: (...args: unknown[]) => mockSave(...args),
}));

let mockPermissions: string[] = [];
vi.mock("../../../../application/hooks/useMyPermissions", () => ({
  useMyPermissions: () => ({ permissions: mockPermissions, isLoading: false, error: null }),
}));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Editor", userId: 1 }),
}));

// The workflow modal itself is tested on its own; here it only hands back a form.
const formData = {
  workflow_title: "Model risk review",
  entity: 1,
  steps: [],
  auto_approve_max_risk: null,
};
vi.mock("../../Modals/NewApprovalWorkflow", () => ({
  default: ({ onSuccess, fixedEntity }: any) => (
    <div data-testid="new-workflow-modal" data-fixed-entity={fixedEntity}>
      <button type="button" onClick={() => onSuccess(formData)}>
        Submit new workflow
      </button>
    </div>
  ),
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import UseCaseWorkflowSelect from "../index";

const onChange = vi.fn();
const Harness = () => {
  const [value, setValue] = useState(0);
  return (
    <UseCaseWorkflowSelect
      id="workflow"
      value={value}
      onChange={(id) => {
        onChange(id);
        setValue(id);
      }}
    />
  );
};

describe("UseCaseWorkflowSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWorkflows = [];
    mockPermissions = ["approvalWorkflow.admin"];
  });

  it("creates a use case workflow in place and selects it", async () => {
    mockSave.mockImplementation(async () => {
      mockWorkflows = [{ id: 12, workflow_title: "Model risk review", entity_type: "use_case" }];
      return { id: 12, workflow_title: "Model risk review", entity_type: "use_case" };
    });
    renderWithProviders(<Harness />);

    expect(await screen.findByTestId("use-case-workflow-empty")).toHaveTextContent(
      "No approval workflows for use cases yet.",
    );
    fireEvent.click(screen.getByTestId("use-case-workflow-create"));
    expect(screen.getByTestId("new-workflow-modal")).toHaveAttribute("data-fixed-entity", "1");
    fireEvent.click(screen.getByRole("button", { name: "Submit new workflow" }));

    await waitFor(() => expect(onChange).toHaveBeenCalledWith(12));
    expect(mockSave).toHaveBeenCalledWith({ formData });
    expect(screen.queryByTestId("new-workflow-modal")).toBeNull();
    // The list was refetched: the new workflow is the selected value.
    expect(await screen.findByRole("combobox")).toHaveTextContent("Model risk review");
    expect(screen.queryByTestId("use-case-workflow-empty")).toBeNull();
  });

  it("says why when the workflow can't be created", async () => {
    mockSave.mockRejectedValue({ message: "Workflow title is required" });
    renderWithProviders(<Harness />);
    fireEvent.click(await screen.findByTestId("use-case-workflow-create"));
    fireEvent.click(screen.getByRole("button", { name: "Submit new workflow" }));
    expect(await screen.findByText("Workflow title is required")).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("offers no create action without the approval workflow admin permission", async () => {
    mockPermissions = ["useCase.edit"];
    renderWithProviders(<Harness />);
    expect(await screen.findByTestId("use-case-workflow-empty")).toHaveTextContent(
      "Ask an Admin to create one.",
    );
    expect(screen.queryByTestId("use-case-workflow-create")).toBeNull();
  });
});
