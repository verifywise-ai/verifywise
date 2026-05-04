import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { LinkedRisksPopup } from "../index";

// Mock dependencies
vi.mock("../../../../application/hooks/useProjectRisks", () => ({
  default: () => ({ projectRisks: [] }),
}));

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisks: vi.fn().mockResolvedValue({ data: [] }),
}));

vi.mock("../../Table/LinkedRisksTable", () => ({
  default: () => <div data-testid="linked-risks-table">LinkedRisksTable</div>,
}));

vi.mock("../../Modals/StandardModal", () => ({
  default: ({
    children,
    title,
    description,
  }: {
    children: React.ReactNode;
    title: string;
    description: string;
  }) => (
    <div data-testid="standard-modal">
      <span>{title}</span>
      <span>{description}</span>
      {children}
    </div>
  ),
}));

vi.mock("../../Inputs/Field", () => ({
  default: (props: { id?: string; value?: string }) => (
    <input data-testid="search-field" id={props.id} value={props.value} readOnly />
  ),
}));

describe("LinkedRisksPopup", () => {
  const defaultProps = {
    onClose: vi.fn(),
    currentRisks: [],
    setSelectecRisks: vi.fn(),
    _setDeletedRisks: vi.fn(),
  };

  it("renders without crashing", () => {
    renderWithProviders(<LinkedRisksPopup {...defaultProps} />);
    expect(screen.getByTestId("standard-modal")).toBeInTheDocument();
  });

  it("shows the modal title", () => {
    renderWithProviders(<LinkedRisksPopup {...defaultProps} />);
    expect(screen.getByText("Link a risk from risk database")).toBeInTheDocument();
  });

  it("shows the search description", () => {
    renderWithProviders(<LinkedRisksPopup {...defaultProps} />);
    expect(screen.getByText("Search from the risk database:")).toBeInTheDocument();
  });

  it("renders the linked risks table", async () => {
    renderWithProviders(<LinkedRisksPopup {...defaultProps} />);
    await waitFor(() => {
      expect(screen.getByTestId("linked-risks-table")).toBeInTheDocument();
    });
  });

  it("renders the search field", () => {
    renderWithProviders(<LinkedRisksPopup {...defaultProps} />);
    expect(screen.getByTestId("search-field")).toBeInTheDocument();
  });
});
