import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import DeleteUseCaseModal from "..";

const mockGetRisks = vi.fn();
const mockBulkUpdate = vi.fn();
const mockCan = vi.fn(() => true);

vi.mock("../../../../../application/repository/project.repository", () => ({
  getRisksLinkedOnlyToProject: (...args: unknown[]) => mockGetRisks(...args),
}));
vi.mock("../../../../../application/repository/projectRisk.repository", () => ({
  bulkUpdateProjectRisks: (...args: unknown[]) => mockBulkUpdate(...args),
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
  const onDelete = vi.fn().mockResolvedValue(undefined);
  const onCancel = vi.fn();
  renderWithProviders(
    <DeleteUseCaseModal
      projectId={7}
      message="This deletes the use case."
      proceedText="Delete"
      onDelete={onDelete}
      onCancel={onCancel}
    />,
  );
  return { onDelete, onCancel };
}

const deleteButton = () => screen.getByRole("button", { name: "Delete" });

describe("DeleteUseCaseModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCan.mockReturnValue(true);
    mockBulkUpdate.mockResolvedValue({ data: { updated: 2, action: "archive" } });
  });

  it("is the plain confirmation when no risk is linked only to this use case", async () => {
    mockGetRisks.mockResolvedValue({ count: 0, risks: [] });
    const { onDelete } = renderModal();

    await waitFor(() => expect(deleteButton()).toBeEnabled());
    expect(screen.getByText("This deletes the use case.")).toBeInTheDocument();
    expect(screen.queryByTestId("delete-use-case-risks-warning")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await userEvent.click(deleteButton());
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(mockBulkUpdate).not.toHaveBeenCalled();
    expect(mockGetRisks).toHaveBeenCalledWith(expect.objectContaining({ id: 7 }));
  });

  it("warns, archives the risks by default, then deletes", async () => {
    mockGetRisks.mockResolvedValue(RISKS);
    const { onDelete } = renderModal();

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
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(mockBulkUpdate).toHaveBeenCalledWith({ ids: [11, 12], action: "archive" });
    expect(mockBulkUpdate.mock.invocationCallOrder[0]).toBeLessThan(
      onDelete.mock.invocationCallOrder[0],
    );
  });

  it("keeps the risks when asked and only deletes", async () => {
    mockGetRisks.mockResolvedValue(RISKS);
    const { onDelete } = renderModal();

    await userEvent.click(await screen.findByTestId("radio-delete-use-case-keep-risks"));
    await userEvent.click(deleteButton());

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(mockBulkUpdate).not.toHaveBeenCalled();
  });

  it("does not delete when the archive fails and says why", async () => {
    mockGetRisks.mockResolvedValue(RISKS);
    mockBulkUpdate.mockRejectedValue(new Error("403"));
    const { onDelete } = renderModal();

    await screen.findByTestId("delete-use-case-risks-warning");
    await userEvent.click(deleteButton());

    expect(await screen.findByTestId("delete-use-case-archive-error")).toHaveTextContent(
      "The risks could not be archived, so the use case was not deleted. Try again.",
    );
    expect(onDelete).not.toHaveBeenCalled();
    expect(deleteButton()).toBeEnabled();
  });

  it("shows a neutral line and still lets the user delete when the count fails", async () => {
    mockGetRisks.mockRejectedValue(new Error("500"));
    const { onDelete } = renderModal();

    expect(await screen.findByTestId("delete-use-case-risks-unknown")).toHaveTextContent(
      "Risks linked only to this use case may become visible to everyone in the organization.",
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();

    await userEvent.click(deleteButton());
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(mockBulkUpdate).not.toHaveBeenCalled();
  });

  it("offers no archive to a role without risks.edit and keeps the warning", async () => {
    mockCan.mockReturnValue(false);
    mockGetRisks.mockResolvedValue({ count: 1, risks: [{ id: 11, risk_name: "Biased scoring" }] });
    const { onDelete } = renderModal();

    expect(await screen.findByTestId("delete-use-case-risks-warning")).toHaveTextContent(
      "1 risk is linked only to this use case.",
    );
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
    expect(screen.getByText("Your role does not allow archiving risks.")).toBeInTheDocument();

    await userEvent.click(deleteButton());
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(mockBulkUpdate).not.toHaveBeenCalled();
  });

  it("archives in batches of 200, the bulk route's limit", async () => {
    const risks = Array.from({ length: 250 }, (_, i) => ({
      id: i + 1,
      risk_name: `Risk ${i + 1}`,
    }));
    mockGetRisks.mockResolvedValue({ count: 250, risks });
    const { onDelete } = renderModal();

    await screen.findByTestId("delete-use-case-risks-warning");
    await userEvent.click(deleteButton());

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    expect(mockBulkUpdate).toHaveBeenCalledTimes(2);
    expect(mockBulkUpdate.mock.calls[0][0].ids).toHaveLength(200);
    expect(mockBulkUpdate.mock.calls[1][0].ids).toHaveLength(50);
  });
});
