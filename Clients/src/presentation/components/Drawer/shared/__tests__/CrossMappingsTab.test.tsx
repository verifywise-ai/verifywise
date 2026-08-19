import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import CrossMappingsTab from "../CrossMappingsTab";
import type { UseLinkedRisksReturn } from "../useLinkedRisks";

vi.mock("../../../LinkedRisks", () => ({
  LinkedRisksPopup: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="linked-risks-popup">
      <button onClick={onClose}>close-popup</button>
    </div>
  ),
}));

vi.mock("../../../AddNewRiskForm", () => ({
  default: () => <div data-testid="add-new-risk-form" />,
}));

vi.mock("../../../Modals/StandardModal", () => ({
  default: ({ children, isOpen, title }: { children: React.ReactNode; isOpen: boolean; title: string }) =>
    isOpen ? (
      <div data-testid="standard-modal">
        <div>{title}</div>
        {children}
      </div>
    ) : null,
}));

function makeRisks(overrides: Partial<UseLinkedRisksReturn> = {}): UseLinkedRisksReturn {
  return {
    currentRisks: [],
    linkedRiskObjects: [],
    selectedRisks: [],
    deletedRisks: [],
    isLinkedRisksModalOpen: false,
    setIsLinkedRisksModalOpen: vi.fn(),
    setSelectedRisks: vi.fn(),
    setDeletedRisks: vi.fn(),
    isRiskDetailModalOpen: false,
    selectedRiskForView: null,
    riskFormData: undefined,
    onRiskSubmitRef: { current: null },
    applyLinkedRisks: vi.fn(),
    handleViewRiskDetails: vi.fn(),
    handleRiskDetailModalClose: vi.fn(),
    handleUnlinkRisk: vi.fn(),
    resetPending: vi.fn(),
    setCurrentRisks: vi.fn(),
    ...overrides,
  } as UseLinkedRisksReturn;
}

const baseProps = {
  frameworkId: 1,
  isOrganizational: false,
  users: [],
  onAlert: vi.fn(),
};

describe("CrossMappingsTab", () => {
  it("shows the empty state and zero-count when there are no linked risks", () => {
    renderWithProviders(<CrossMappingsTab risks={makeRisks()} {...baseProps} />);

    expect(screen.getByText("0 risks linked")).toBeInTheDocument();
    expect(screen.getByText("No risks linked yet")).toBeInTheDocument();
  });

  it("renders each linked risk with its level, excluding ones pending deletion", () => {
    const risks = makeRisks({
      currentRisks: [1, 2],
      linkedRiskObjects: [
        { id: 1, risk_name: "Data leak", risk_level: "High" },
        { id: 2, risk_name: "Removed risk", risk_level: "Low" },
      ],
      deletedRisks: [2],
    });
    renderWithProviders(<CrossMappingsTab risks={risks} {...baseProps} />);

    expect(screen.getByText("Data leak")).toBeInTheDocument();
    expect(screen.getByText("Risk level: High")).toBeInTheDocument();
    expect(screen.queryByText("Removed risk")).not.toBeInTheDocument();
  });

  it("shows pending-save and pending-delete counts", () => {
    const risks = makeRisks({ selectedRisks: [3], deletedRisks: [4] });
    renderWithProviders(<CrossMappingsTab risks={risks} {...baseProps} />);

    expect(screen.getByText("+1 pending save")).toBeInTheDocument();
    expect(screen.getByText("-1 pending delete")).toBeInTheDocument();
  });

  it("opens the linked-risks popup when 'Add/remove risks' is clicked", () => {
    const risks = makeRisks();
    renderWithProviders(<CrossMappingsTab risks={risks} {...baseProps} />);

    fireEvent.click(screen.getByText("Add/remove risks"));

    expect(risks.setIsLinkedRisksModalOpen).toHaveBeenCalledWith(true);
  });

  it("renders the linked-risks popup when isLinkedRisksModalOpen is true", () => {
    const risks = makeRisks({ isLinkedRisksModalOpen: true });
    renderWithProviders(<CrossMappingsTab risks={risks} {...baseProps} />);

    expect(screen.getByTestId("linked-risks-popup")).toBeInTheDocument();
  });

  it("calls handleViewRiskDetails when a risk's view icon is clicked", () => {
    const risk = { id: 1, risk_name: "Data leak" };
    const risks = makeRisks({ currentRisks: [1], linkedRiskObjects: [risk] });
    renderWithProviders(<CrossMappingsTab risks={risks} {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    expect(risks.handleViewRiskDetails).toHaveBeenCalledWith(risk);
  });

  it("calls handleUnlinkRisk when a risk's unlink icon is clicked", () => {
    const risk = { id: 1, risk_name: "Data leak" };
    const risks = makeRisks({ currentRisks: [1], linkedRiskObjects: [risk] });
    renderWithProviders(<CrossMappingsTab risks={risks} {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: "Unlink risk" }));

    expect(risks.handleUnlinkRisk).toHaveBeenCalledWith(1);
  });

  it("disables the add/remove and unlink actions when isEditingDisabled", () => {
    const risk = { id: 1, risk_name: "Data leak" };
    const risks = makeRisks({ currentRisks: [1], linkedRiskObjects: [risk] });
    renderWithProviders(<CrossMappingsTab risks={risks} {...baseProps} isEditingDisabled />);

    expect(screen.getByText("Add/remove risks").closest("button")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Unlink risk" })).toBeDisabled();
  });

  it("renders the risk-detail modal with the AddNewRiskForm when a risk is selected and loaded", () => {
    const risks = makeRisks({
      isRiskDetailModalOpen: true,
      selectedRiskForView: { id: 1, risk_name: "Data leak" },
      riskFormData: { riskName: "Data leak" } as any,
    });
    renderWithProviders(<CrossMappingsTab risks={risks} {...baseProps} />);

    expect(screen.getByTestId("standard-modal")).toBeInTheDocument();
    expect(screen.getByText("Risk: Data leak")).toBeInTheDocument();
    expect(screen.getByTestId("add-new-risk-form")).toBeInTheDocument();
  });

  it("does not render the risk-detail modal until riskFormData has loaded", () => {
    const risks = makeRisks({
      isRiskDetailModalOpen: true,
      selectedRiskForView: { id: 1, risk_name: "Data leak" },
      riskFormData: undefined,
    });
    renderWithProviders(<CrossMappingsTab risks={risks} {...baseProps} />);

    expect(screen.queryByTestId("standard-modal")).not.toBeInTheDocument();
  });
});
