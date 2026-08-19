import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import FindingDrawer from "./FindingDrawer";
import { MrmFindingSeverity, MrmFindingStage } from "../../../../domain/enums/mrm.enum";
import { IMrmFinding } from "../../../../domain/interfaces/i.mrm";
import { MrmUser } from "./types";

const mockMutateAsync = vi.fn();
const mockUseUpdateFinding = vi.fn();

vi.mock("../../../../application/hooks/useMrm", () => ({
  useUpdateFinding: () => mockUseUpdateFinding(),
}));

const users: MrmUser[] = [{ id: 1, name: "Jane", surname: "Doe" }];

const finding: IMrmFinding = {
  id: 5,
  organization_id: 1,
  model_inventory_id: 1,
  validation_id: 10,
  title: "PSI drift unmonitored",
  severity: MrmFindingSeverity.HIGH,
  stage: MrmFindingStage.OPEN,
  owner_id: 1,
  remediation_plan: "Investigate feature drift",
  due_date: "2026-09-01T00:00:00Z",
  closed_verified: false,
};

describe("FindingDrawer", () => {
  const onClose = vi.fn();
  const onError = vi.fn();
  const onSuccess = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseUpdateFinding.mockReturnValue({ mutateAsync: mockMutateAsync, isPending: false });
  });

  it("renders nothing (closed) when no finding is provided", () => {
    renderWithProviders(
      <FindingDrawer
        finding={null}
        users={users}
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.queryByText("Save")).not.toBeInTheDocument();
  });

  it("seeds the form from the finding when opened", () => {
    renderWithProviders(
      <FindingDrawer
        finding={finding}
        users={users}
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );
    expect(screen.getByText("PSI drift unmonitored")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Investigate feature drift")).toBeInTheDocument();
  });

  it("blocks closing a finding without verification", async () => {
    renderWithProviders(
      <FindingDrawer
        finding={{ ...finding, stage: MrmFindingStage.CLOSED }}
        users={users}
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("A finding must be verified before it can be closed.");
    });
    expect(mockMutateAsync).not.toHaveBeenCalled();
  });

  it("saves the finding update", async () => {
    mockMutateAsync.mockResolvedValue({});
    renderWithProviders(
      <FindingDrawer
        finding={finding}
        users={users}
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        id: 5,
        payload: {
          stage: MrmFindingStage.OPEN,
          severity: MrmFindingSeverity.HIGH,
          owner_id: 1,
          remediation_plan: "Investigate feature drift",
          due_date: "2026-09-01",
          closed_verified: false,
        },
      });
      expect(onSuccess).toHaveBeenCalledWith("Finding updated");
      expect(onClose).toHaveBeenCalled();
    });
  });

  it("surfaces an error message when saving fails", async () => {
    mockMutateAsync.mockRejectedValue({ response: { data: { message: "server error" } } });
    renderWithProviders(
      <FindingDrawer
        finding={finding}
        users={users}
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(onError).toHaveBeenCalledWith("server error");
    });
  });

  it("toggles the verified checkbox", async () => {
    mockMutateAsync.mockResolvedValue({});
    renderWithProviders(
      <FindingDrawer
        finding={{ ...finding, stage: MrmFindingStage.CLOSED }}
        users={users}
        onClose={onClose}
        onError={onError}
        onSuccess={onSuccess}
      />,
    );

    const checkbox = screen.getByRole("checkbox");
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByText("Save"));

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith(
        expect.objectContaining({ payload: expect.objectContaining({ closed_verified: true }) }),
      );
    });
  });
});
