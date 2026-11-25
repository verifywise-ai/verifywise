import { vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";

vi.mock("../../../../../application/repository/user.repository", () => ({
  getAllUsers: vi.fn().mockResolvedValue({ data: [{ id: 2, name: "Ana", surname: "Lee" }] }),
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

/** Fill the required fields of a one-step use case workflow. */
const fillForm = async () => {
  fireEvent.change(screen.getByPlaceholderText("Enter workflow title"), {
    target: { value: "Model risk review" },
  });
  fireEvent.change(screen.getByPlaceholderText("Enter step name"), {
    target: { value: "Legal" },
  });
  const approvers = screen.getByPlaceholderText("Select approvers");
  fireEvent.mouseDown(approvers);
  fireEvent.click(await screen.findByRole("option", { name: "Ana Lee" }));
};

const createButton = () =>
  within(screen.getByRole("dialog")).getByRole("button", { name: "Create workflow" });

describe("NewApprovalWorkflow async save", () => {
  it("keeps the input and shows the reason when the save is refused", async () => {
    const onSuccess = vi.fn().mockRejectedValue({ message: "Workflow title already in use" });
    renderWithProviders(
      <CreateNewApprovalWorkflow
        isOpen
        setIsOpen={vi.fn()}
        fixedEntity={1}
        onSuccess={onSuccess}
      />,
    );
    await fillForm();
    fireEvent.click(createButton());

    expect(await screen.findByText("Workflow title already in use")).toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledTimes(1);
    expect(screen.getByPlaceholderText("Enter workflow title")).toHaveValue("Model risk review");
  });

  it("saves once while the request runs, and clears the form when it succeeds", async () => {
    let resolveSave: () => void = () => {};
    const onSuccess = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderWithProviders(
      <CreateNewApprovalWorkflow
        isOpen
        setIsOpen={vi.fn()}
        fixedEntity={1}
        onSuccess={onSuccess}
      />,
    );
    await fillForm();
    fireEvent.click(createButton());
    fireEvent.click(createButton());
    expect(onSuccess).toHaveBeenCalledTimes(1);
    // Still filled in while the save runs.
    expect(screen.getByPlaceholderText("Enter workflow title")).toHaveValue("Model risk review");

    await act(async () => resolveSave());
    await waitFor(() =>
      expect(screen.getByPlaceholderText("Enter workflow title")).toHaveValue(""),
    );
  });
});
