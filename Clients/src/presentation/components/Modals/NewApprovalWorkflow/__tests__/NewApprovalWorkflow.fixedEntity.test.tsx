import { vi } from "vitest";
import { screen, within } from "@testing-library/react";

vi.mock("../../../../../application/repository/user.repository", () => ({
  getAllUsers: vi.fn().mockResolvedValue({ data: [] }),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import CreateNewApprovalWorkflow from "../index";

const entitySelect = () =>
  within(screen.getByRole("dialog")).getAllByRole("combobox")[0] as HTMLElement;

describe("NewApprovalWorkflow fixedEntity", () => {
  it("presets and locks the entity when a use case screen opens it", () => {
    renderWithProviders(<CreateNewApprovalWorkflow isOpen setIsOpen={vi.fn()} fixedEntity={1} />);
    expect(entitySelect()).toHaveTextContent("Use case");
    expect(entitySelect()).toHaveAttribute("aria-disabled", "true");
    // The auto-approve threshold only exists for use case workflows.
    expect(screen.getByText("Auto-approve up to risk level")).toBeInTheDocument();
  });

  it("leaves the entity open on the Approval workflows page", () => {
    renderWithProviders(<CreateNewApprovalWorkflow isOpen setIsOpen={vi.fn()} />);
    expect(entitySelect()).toHaveTextContent("Select entity");
    expect(entitySelect()).not.toHaveAttribute("aria-disabled", "true");
    expect(screen.queryByText("Auto-approve up to risk level")).toBeNull();
  });
});
