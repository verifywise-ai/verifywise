import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AnnexOverviewCard from "../AnnexOverviewCard";

const mockGetAnnexes = vi.fn();

vi.mock("../../../../../application/repository/annex_struct_iso.repository", () => ({
  GetAnnexesByProjectFrameworkId: (...args: any[]) => mockGetAnnexes(...args),
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

const iso42001Annexes = [
  {
    id: 1,
    title: "Organizational policies and governance",
    arrangement: "1",
    annexCategories: [
      { id: 1, title: "Item 1", status: "Implemented", owner: 5 },
      { id: 2, title: "Item 2", status: "Not started", owner: null },
    ],
  },
];

const iso27001Annexes = [
  {
    id: 1,
    title: "A.5 Information security policies",
    annexControls: [
      { id: 1, title: "Control 1", status: "Implemented", owner: 5 },
      { id: 2, title: "Control 2", status: "Draft", owner: 7 },
    ],
  },
];

describe("AnnexOverviewCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows loading state initially then renders nothing for empty frameworks", async () => {
    renderWithProviders(<AnnexOverviewCard frameworksData={[]} />);
    await waitFor(() => {
      expect(screen.getByText("No ISO framework annexes data available.")).toBeInTheDocument();
    });
  });

  it("renders ISO 42001 annex overview data", async () => {
    mockGetAnnexes.mockResolvedValue({ data: iso42001Annexes });
    renderWithProviders(<AnnexOverviewCard frameworksData={[iso42001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("ISO 42001 annexes overview")).toBeInTheDocument();
    });
    expect(screen.getByText(/Organizational policies and governance/)).toBeInTheDocument();
    expect(screen.getAllByText("1/2").length).toBeGreaterThan(0);
    expect(screen.getByText("controls implemented")).toBeInTheDocument();
    expect(screen.getByText("assigned")).toBeInTheDocument();
  });

  it("renders ISO 27001 annex overview data with A.x number extraction", async () => {
    mockGetAnnexes.mockResolvedValue({ data: iso27001Annexes });
    renderWithProviders(<AnnexOverviewCard frameworksData={[iso27001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("ISO 27001 annexes overview")).toBeInTheDocument();
    });
    expect(screen.getByText(/A\.5/)).toBeInTheDocument();
    expect(screen.getByText(/Information security policies/)).toBeInTheDocument();
  });

  it("renders both frameworks with a spacer between sections", async () => {
    mockGetAnnexes.mockImplementation(({ routeUrl }: any) => {
      if (routeUrl.includes("iso-42001")) {
        return Promise.resolve({ data: iso42001Annexes });
      }
      return Promise.resolve({ data: iso27001Annexes });
    });
    renderWithProviders(
      <AnnexOverviewCard frameworksData={[iso42001Framework, iso27001Framework]} />,
    );
    await waitFor(() => {
      expect(screen.getByText("ISO 42001 annexes overview")).toBeInTheDocument();
    });
    expect(screen.getByText("ISO 27001 annexes overview")).toBeInTheDocument();
  });

  it("calls onNavigate when the chevron is clicked", async () => {
    const onNavigate = vi.fn();
    mockGetAnnexes.mockResolvedValue({ data: iso42001Annexes });
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <AnnexOverviewCard frameworksData={[iso42001Framework]} onNavigate={onNavigate} />,
    );
    await waitFor(() => {
      expect(screen.getByText("ISO 42001 annexes overview")).toBeInTheDocument();
    });
    const chevron = container.querySelector("svg.lucide-chevron-right")?.closest("div");
    expect(chevron).toBeTruthy();
    await user.click(chevron as Element);
    expect(onNavigate).toHaveBeenCalledWith("ISO 42001", "annexes");
  });

  it("handles annex fetch error gracefully", async () => {
    mockGetAnnexes.mockRejectedValue(new Error("network error"));
    renderWithProviders(<AnnexOverviewCard frameworksData={[iso42001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("No ISO framework annexes data available.")).toBeInTheDocument();
    });
  });

  it("renders placeholder square when annex has no items", async () => {
    mockGetAnnexes.mockResolvedValue({
      data: [{ id: 1, title: "Empty annex", arrangement: "1", annexCategories: [] }],
    });
    renderWithProviders(<AnnexOverviewCard frameworksData={[iso42001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText(/Empty annex/)).toBeInTheDocument();
    });
    expect(screen.getAllByText("0/0").length).toBeGreaterThan(0);
  });

  it("handles nested data.data response shape for ISO 27001", async () => {
    mockGetAnnexes.mockResolvedValue({ data: { data: iso27001Annexes } });
    renderWithProviders(<AnnexOverviewCard frameworksData={[iso27001Framework]} />);
    await waitFor(() => {
      expect(screen.getByText("ISO 27001 annexes overview")).toBeInTheDocument();
    });
  });
});
