import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockGetAllProjectRisksByProjectId = vi.fn();

vi.mock("../../../../application/repository/projectRisk.repository", () => ({
  getAllProjectRisksByProjectId: (...args: any[]) => mockGetAllProjectRisksByProjectId(...args),
}));

import FriaRiskImportModal from "./FriaRiskImportModal";

const risks = [
  { id: 1, risk_name: "Risk A", likelihood: "Likely", severity: "Major" },
  { id: 2, risk_name: "Risk B", likelihood: "Rare", final_risk_level: "Negligible" },
];

describe("FriaRiskImportModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAllProjectRisksByProjectId.mockResolvedValue({ data: risks });
  });

  it("does not fetch when closed", () => {
    renderWithProviders(
      <FriaRiskImportModal
        open={false}
        onClose={vi.fn()}
        projectId="1"
        existingLinkedRiskIds={[]}
        onImport={vi.fn()}
      />,
    );
    expect(mockGetAllProjectRisksByProjectId).not.toHaveBeenCalled();
  });

  it("shows a loading state then lists available risks", async () => {
    renderWithProviders(
      <FriaRiskImportModal
        open={true}
        onClose={vi.fn()}
        projectId="1"
        existingLinkedRiskIds={[]}
        onImport={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(mockGetAllProjectRisksByProjectId).toHaveBeenCalledWith({
        projectId: "1",
        filter: "active",
      });
    });

    expect(await screen.findByText("Risk A")).toBeInTheDocument();
    expect(screen.getByText("Risk B")).toBeInTheDocument();
  });

  it("shows an empty state when no project risks exist", async () => {
    mockGetAllProjectRisksByProjectId.mockResolvedValue({ data: [] });
    renderWithProviders(
      <FriaRiskImportModal
        open={true}
        onClose={vi.fn()}
        projectId="1"
        existingLinkedRiskIds={[]}
        onImport={vi.fn()}
      />,
    );

    expect(await screen.findByText("No project risks found.")).toBeInTheDocument();
  });

  it("shows a message when all risks are already linked", async () => {
    renderWithProviders(
      <FriaRiskImportModal
        open={true}
        onClose={vi.fn()}
        projectId="1"
        existingLinkedRiskIds={[1, 2]}
        onImport={vi.fn()}
      />,
    );

    expect(await screen.findByText("All project risks are already linked.")).toBeInTheDocument();
  });

  it("resets to an empty risk list when fetching fails", async () => {
    mockGetAllProjectRisksByProjectId.mockRejectedValue(new Error("fail"));
    renderWithProviders(
      <FriaRiskImportModal
        open={true}
        onClose={vi.fn()}
        projectId="1"
        existingLinkedRiskIds={[]}
        onImport={vi.fn()}
      />,
    );

    expect(await screen.findByText("No project risks found.")).toBeInTheDocument();
  });

  it("selects risks, normalizes fields, and imports them", async () => {
    const onImport = vi.fn();
    const onClose = vi.fn();
    renderWithProviders(
      <FriaRiskImportModal
        open={true}
        onClose={onClose}
        projectId="1"
        existingLinkedRiskIds={[]}
        onImport={onImport}
      />,
    );

    fireEvent.click(await screen.findByText("Risk A"));
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Risk B"));
    expect(screen.getByText("2 selected")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /import \(2\)/i }));

    expect(onImport).toHaveBeenCalledWith([
      {
        risk_description: "Risk A",
        likelihood: "High",
        severity: "High",
        linked_project_risk_id: 1,
      },
      {
        risk_description: "Risk B",
        likelihood: "Low",
        severity: "Low",
        linked_project_risk_id: 2,
      },
    ]);
    expect(onClose).toHaveBeenCalled();
  });

  it("toggling a selected risk row again deselects it", async () => {
    renderWithProviders(
      <FriaRiskImportModal
        open={true}
        onClose={vi.fn()}
        projectId="1"
        existingLinkedRiskIds={[]}
        onImport={vi.fn()}
      />,
    );

    const riskARow = (await screen.findByText("Risk A")).closest("tr")!;
    fireEvent.click(riskARow);
    expect(screen.getByText("1 selected")).toBeInTheDocument();

    fireEvent.click(riskARow);
    expect(screen.queryByText("1 selected")).not.toBeInTheDocument();
  });
});
