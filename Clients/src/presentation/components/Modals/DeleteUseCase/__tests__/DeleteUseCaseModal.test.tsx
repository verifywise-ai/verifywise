import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import DeleteUseCaseModal from "..";

const mockGetRisks = vi.fn();
const mockDeleteUseCase = vi.fn();
const mockCan = vi.fn(() => true);

vi.mock("../../../../../application/repository/project.repository", () => ({
  getRisksLinkedOnlyToProject: (...args: unknown[]) => mockGetRisks(...args),
  deleteUseCase: (...args: unknown[]) => mockDeleteUseCase(...args),
}));
vi.mock("../../../../../application/hooks/useCan", () => ({
  useCan: () => mockCan(),
  useCanCheck: () => () => mockCan(),
  usePermissionsSettled: () => true,
}));

const RISKS = {
  count: 2,
  risks: [
    { id: 11, risk_name: "Biased scoring" },
    { id: 12, risk_name: "Model drift" },
  ],
};

function renderModal() {
  const onDeleted = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  renderWithProviders(
    <DeleteUseCaseModal
      projectId={7}
      message="This deletes the use case."
      proceedText="Delete"
      onDeleted={onDeleted}
      onCancel={onCancel}
    />,
  );
  return { onDeleted, onCancel };
}

const deleteButton = () => screen.getByRole("button", { name: "Delete" });

describe("DeleteUseCaseModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCan.mockReturnValue(true);
    mockDeleteUseCase.mockResolvedValue({ deleted: true, archived_risk_ids: [] });
  });

  it("is the plain confirmation when no risk is linked only to this use case", async () => {
    mockGetRisks.mockResolvedValue({ count: 0, risks: [] });
    const { onDeleted } = renderModal();

    await waitFor(() => expect(deleteButton()).toBeEnabled());
    expect(screen.getByText("This deletes the use case.")).toBeInTheDocument();
    expect(screen.queryByTestId("delete-use-case-risks-warning")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await userEvent.click(deleteButton());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(mockDeleteUseCase).toHaveBeenCalledTimes(1);
    expect(mockDeleteUseCase).toHaveBeenCalledWith({ id: 7, archiveRisksLinkedOnlyHere: false });
    expect(mockGetRisks).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("warns and sends one delete that archives the risks by default", async () => {
    mockGetRisks.mockResolvedValue(RISKS);
    mockDeleteUseCase.mockResolvedValue({ deleted: true, archived_risk_ids: [11, 12] });
    const { onDeleted } = renderModal();

    expect(await screen.findByTestId("delete-use-case-risks-warning")).toHaveTextContent(
      "2 risks are linked only to this use case. After you delete it, everyone in the organization can see them.",
    );
    expect(screen.getByTestId("radio-delete-use-case-archive-risks")).toBeChecked();
    expect(screen.getByTestId("radio-delete-use-case-keep-risks")).not.toBeChecked();
    expect(
      screen.getByText("To keep them private, cancel and link them to another use case first."),
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId("button-delete-use-case-risk-names"));
    expect(screen.getByText("Biased scoring")).toBeVisible();

    await userEvent.click(deleteButton());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(mockDeleteUseCase).toHaveBeenCalledTimes(1);
    expect(mockDeleteUseCase).toHaveBeenCalledWith({ id: 7, archiveRisksLinkedOnlyHere: true });
    expect(onDeleted).toHaveBeenCalledWith({ deleted: true, archived_risk_ids: [11, 12] });
  });

  it("keeps the risks when asked", async () => {
    mockGetRisks.mockResolvedValue(RISKS);
    const { onDeleted } = renderModal();

    await userEvent.click(await screen.findByTestId("radio-delete-use-case-keep-risks"));
    await userEvent.click(deleteButton());

    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(mockDeleteUseCase).toHaveBeenCalledWith({ id: 7, archiveRisksLinkedOnlyHere: false });
  });

  it("stays open with an error when the delete fails, and lets the user retry", async () => {
    mockGetRisks.mockResolvedValue(RISKS);
    mockDeleteUseCase.mockRejectedValueOnce(new Error("500"));
    const { onDeleted, onCancel } = renderModal();

    await screen.findByTestId("delete-use-case-risks-warning");
    await userEvent.click(deleteButton());

    expect(await screen.findByTestId("delete-use-case-error")).toHaveTextContent(
      "The use case could not be deleted. Nothing was changed. Try again.",
    );
    expect(onDeleted).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId("delete-use-case-modal")).toBeInTheDocument();
    // The list is read again, since it may have changed.
    await waitFor(() => expect(mockGetRisks).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(deleteButton()).toBeEnabled());

    await userEvent.click(deleteButton());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("delete-use-case-error")).not.toBeInTheDocument();
  });

  it("cannot be closed or sent twice while the delete runs", async () => {
    mockGetRisks.mockResolvedValue(RISKS);
    let finish: (value: unknown) => void = () => {};
    mockDeleteUseCase.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    const { onDeleted, onCancel } = renderModal();

    await screen.findByTestId("delete-use-case-risks-warning");
    await userEvent.click(deleteButton());

    const cancel = screen.getByRole("button", { name: "Cancel" });
    await waitFor(() => expect(cancel).toBeDisabled());
    fireEvent.click(cancel);
    fireEvent.keyDown(screen.getByTestId("delete-use-case-modal"), { key: "Escape" });
    const backdrop = document.querySelector(".confirmation-backdrop");
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    fireEvent.click(screen.getByRole("button", { name: "Processing..." }));

    expect(onCancel).not.toHaveBeenCalled();
    expect(mockDeleteUseCase).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("radio-delete-use-case-archive-risks")).toBeDisabled();

    finish({ deleted: true, archived_risk_ids: [11, 12] });
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
  });

  it("shows a neutral line and deletes without archiving when the count fails", async () => {
    mockGetRisks.mockRejectedValue(new Error("500"));
    const { onDeleted } = renderModal();

    expect(await screen.findByTestId("delete-use-case-risks-unknown")).toHaveTextContent(
      "Risks linked only to this use case may become visible to everyone in the organization.",
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await userEvent.click(deleteButton());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(mockDeleteUseCase).toHaveBeenCalledWith({ id: 7, archiveRisksLinkedOnlyHere: false });
  });

  it("offers no archive to a role without risks.edit and keeps the warning", async () => {
    mockCan.mockReturnValue(false);
    mockGetRisks.mockResolvedValue({ count: 1, risks: [{ id: 11, risk_name: "Biased scoring" }] });
    const { onDeleted } = renderModal();

    expect(await screen.findByTestId("delete-use-case-risks-warning")).toHaveTextContent(
      "1 risk is linked only to this use case.",
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText("Your role does not allow archiving risks.")).toBeInTheDocument();

    await userEvent.click(deleteButton());
    await waitFor(() => expect(onDeleted).toHaveBeenCalledTimes(1));
    expect(mockDeleteUseCase).toHaveBeenCalledWith({ id: 7, archiveRisksLinkedOnlyHere: false });
  });
});
