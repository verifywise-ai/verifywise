import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";

vi.mock("../../../components/IconButton", () => ({
  default: ({ onEdit, onDelete }: any) => (
    <div>
      <button onClick={onEdit}>Edit workflow</button>
      <button onClick={onDelete}>Archive workflow</button>
    </div>
  ),
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import ApprovalWorkflowsTable from "../ApprovalWorkflowsTable";

const DATA: any[] = [
  { id: 5, workflow_title: "Model sign-off", entity: 1, steps: [{}, {}], date_updated: null },
];

describe("ApprovalWorkflowsTable", () => {
  it("shows the actions column and opens the editor from a row with handlers", () => {
    const onEdit = vi.fn();
    renderWithProviders(<ApprovalWorkflowsTable data={DATA} onEdit={onEdit} onArchive={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Edit workflow" })).toBeInTheDocument();
    fireEvent.click(screen.getByText("Model sign-off"));
    expect(onEdit).toHaveBeenCalledWith("5");
  });

  it("is read-only without handlers: no actions and rows do not open the editor", () => {
    renderWithProviders(<ApprovalWorkflowsTable data={DATA} />);

    expect(screen.getByText("Model sign-off")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit workflow" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Archive workflow" })).not.toBeInTheDocument();
    expect(screen.queryByText("ACTIONS")).not.toBeInTheDocument();
  });
});
