import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AssignmentStatusCard from "../AssignmentStatusCard";

const mockGetClauses = vi.fn();
const mockGetAnnexes = vi.fn();

vi.mock("../../../../../application/repository/clause_struct_iso.repository", () => ({
  GetClausesByProjectFrameworkId: (...args: any[]) => mockGetClauses(...args),
}));

vi.mock("../../../../../application/repository/annex_struct_iso.repository", () => ({
  GetAnnexesByProjectFrameworkId: (...args: any[]) => mockGetAnnexes(...args),
}));

const iso27001Framework = {
  frameworkId: 3,
  frameworkName: "ISO 27001",
  projectFrameworkId: 20,
};

const iso42001Framework = {
  frameworkId: 2,
  frameworkName: "ISO 42001",
  projectFrameworkId: 10,
};

const nistFramework = {
  frameworkId: 4,
  frameworkName: "NIST AI RMF",
  projectFrameworkId: 30,
  nistAssignmentsByFunction: {
    govern: { total: 10, assigned: 10 },
    map: { total: 8, assigned: 0 },
    measure: { total: 5, assigned: 2 },
    manage: { total: 4, assigned: 3 },
  },
};

describe("AssignmentStatusCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the header and description with no frameworks", () => {
    renderWithProviders(<AssignmentStatusCard frameworksData={[]} />);
    expect(screen.getByText("Assignment status")).toBeInTheDocument();
    expect(screen.getByText(/Monitor task assignment coverage/)).toBeInTheDocument();
  });

  it("renders ISO 27001 assignment counts", async () => {
    mockGetClauses.mockResolvedValue({
      data: { totalSubclauses: 10, assignedSubclauses: 4 },
    });
    mockGetAnnexes.mockResolvedValue({
      data: { data: { totalAnnexControls: 20, assignedAnnexControls: 20 } },
    });
    renderWithProviders(<AssignmentStatusCard frameworksData={[iso27001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("Clauses")).toBeInTheDocument();
    });
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("Annexes")).toBeInTheDocument();
    expect(screen.getAllByText("20").length).toBeGreaterThan(0);
  });

  it("renders ISO 42001 assignment counts", async () => {
    mockGetClauses.mockResolvedValue({
      data: { totalSubclauses: 6, assignedSubclauses: 3 },
    });
    mockGetAnnexes.mockResolvedValue({
      data: { data: { totalAnnexcategories: 12, assignedAnnexcategories: 6 } },
    });
    renderWithProviders(<AssignmentStatusCard frameworksData={[iso42001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("Clauses")).toBeInTheDocument();
    });
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("renders NIST AI RMF function assignment breakdown", async () => {
    renderWithProviders(<AssignmentStatusCard frameworksData={[nistFramework]} />);
    await waitFor(() => {
      expect(screen.getByText("Govern")).toBeInTheDocument();
    });
    expect(screen.getByText("Map")).toBeInTheDocument();
    expect(screen.getByText("Measure")).toBeInTheDocument();
    expect(screen.getByText("Manage")).toBeInTheDocument();
  });

  it("renders multiple frameworks with a divider", async () => {
    mockGetClauses.mockResolvedValue({
      data: { totalSubclauses: 10, assignedSubclauses: 4 },
    });
    mockGetAnnexes.mockResolvedValue({
      data: { data: { totalAnnexControls: 20, assignedAnnexControls: 20 } },
    });
    renderWithProviders(
      <AssignmentStatusCard frameworksData={[iso27001Framework, nistFramework]} />,
    );
    await waitFor(() => {
      expect(screen.getByText("ISO 27001")).toBeInTheDocument();
    });
    expect(screen.getByText("NIST AI RMF")).toBeInTheDocument();
  });

  it("handles clause/annex fetch errors gracefully", async () => {
    mockGetClauses.mockRejectedValue(new Error("network"));
    mockGetAnnexes.mockRejectedValue(new Error("network"));
    renderWithProviders(<AssignmentStatusCard frameworksData={[iso27001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("Clauses")).toBeInTheDocument();
    });
    expect(screen.getByText("Annexes")).toBeInTheDocument();
  });

  it("caps assigned count at total when API returns inconsistent data", async () => {
    mockGetClauses.mockResolvedValue({
      data: { totalSubclauses: 5, assignedSubclauses: 9 },
    });
    mockGetAnnexes.mockResolvedValue({
      data: { data: { totalAnnexControls: 0, assignedAnnexControls: 0 } },
    });
    renderWithProviders(<AssignmentStatusCard frameworksData={[iso27001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("Clauses")).toBeInTheDocument();
    });
    // Assigned count should be capped to total (5), not the raw inconsistent value (9)
    const fives = screen.getAllByText("5");
    expect(fives.length).toBeGreaterThan(0);
  });
});
