import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import ControlCategoriesCard from "../ControlCategoriesCard";

const mockGetClausesIso42001 = vi.fn();
const mockGetClausesIso27001 = vi.fn();

vi.mock("../../../../../application/repository/clause_struct_iso.repository", () => ({
  GetClausesByProjectFrameworkId: (...args: any[]) => mockGetClausesIso42001(...args),
  Iso27001GetClauseStructByFrameworkID: (...args: any[]) => mockGetClausesIso27001(...args),
}));

const iso42001Framework = {
  frameworkId: 2,
  frameworkName: "ISO 42001",
  projectFrameworkId: 10,
};

const iso27001Framework = {
  frameworkId: 3,
  frameworkName: "ISO 27001",
  projectFrameworkId: 20,
};

const iso42001Clauses = [
  {
    id: 1,
    title: "Custom title",
    clause_no: "5",
    subClauses: [
      { id: 1, title: "Sub 1", status: "Implemented", owner: 3 },
      { id: 2, title: "Sub 2", status: "Not started", owner: null },
    ],
  },
  // Out-of-range clause, should be filtered out
  {
    id: 2,
    title: "Scope",
    clause_no: "3",
    subClauses: [],
  },
];

const iso27001Clauses = [
  {
    id: 1,
    title: "Custom title 27001",
    arrangement: "6",
    subClauses: [
      { id: 1, title: "Sub A", status: "Implemented", owner: 5 },
    ],
  },
];

describe("ControlCategoriesCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows no data message when there are no frameworks", async () => {
    renderWithProviders(<ControlCategoriesCard frameworksData={[]} />);
    await waitFor(() => {
      expect(screen.getByText("No ISO framework clauses data available.")).toBeInTheDocument();
    });
  });

  it("renders ISO 42001 clause categories using predefined mapping and filters out-of-range clauses", async () => {
    mockGetClausesIso42001.mockResolvedValue({ data: iso42001Clauses });
    renderWithProviders(<ControlCategoriesCard frameworksData={[iso42001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("ISO 42001 clauses overview")).toBeInTheDocument();
    });
    expect(screen.getByText(/Leadership/)).toBeInTheDocument();
    expect(screen.queryByText(/Custom title/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Scope/)).not.toBeInTheDocument();
    expect(screen.getAllByText("1/2").length).toBeGreaterThan(0);
  });

  it("renders ISO 27001 clause categories", async () => {
    mockGetClausesIso27001.mockResolvedValue({ data: iso27001Clauses });
    renderWithProviders(<ControlCategoriesCard frameworksData={[iso27001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("ISO 27001 clauses overview")).toBeInTheDocument();
    });
    expect(screen.getByText(/Planning/)).toBeInTheDocument();
  });

  it("renders both frameworks together", async () => {
    mockGetClausesIso42001.mockResolvedValue({ data: iso42001Clauses });
    mockGetClausesIso27001.mockResolvedValue({ data: iso27001Clauses });
    renderWithProviders(
      <ControlCategoriesCard frameworksData={[iso42001Framework, iso27001Framework]} />,
    );
    await waitFor(() => {
      expect(screen.getByText("ISO 42001 clauses overview")).toBeInTheDocument();
    });
    expect(screen.getByText("ISO 27001 clauses overview")).toBeInTheDocument();
  });

  it("calls onNavigate when the chevron is clicked", async () => {
    const onNavigate = vi.fn();
    mockGetClausesIso42001.mockResolvedValue({ data: iso42001Clauses });
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <ControlCategoriesCard frameworksData={[iso42001Framework]} onNavigate={onNavigate} />,
    );
    await waitFor(() => {
      expect(screen.getByText("ISO 42001 clauses overview")).toBeInTheDocument();
    });
    const chevron = container.querySelector("svg.lucide-chevron-right")?.closest("div");
    await user.click(chevron as Element);
    expect(onNavigate).toHaveBeenCalledWith("ISO 42001", "clauses");
  });

  it("handles fetch error gracefully", async () => {
    mockGetClausesIso42001.mockRejectedValue(new Error("network error"));
    renderWithProviders(<ControlCategoriesCard frameworksData={[iso42001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("No ISO framework clauses data available.")).toBeInTheDocument();
    });
  });

  it("handles invalid response shape gracefully", async () => {
    mockGetClausesIso42001.mockResolvedValue(null);
    renderWithProviders(<ControlCategoriesCard frameworksData={[iso42001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("No ISO framework clauses data available.")).toBeInTheDocument();
    });
  });
});
