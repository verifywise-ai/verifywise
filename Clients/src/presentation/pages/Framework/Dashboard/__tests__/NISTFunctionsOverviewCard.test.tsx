import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import NISTFunctionsOverviewCard from "../NISTFunctionsOverviewCard";

const mockGetEntityById = vi.fn();

vi.mock("../../../../../application/repository/entity.repository", () => ({
  getEntityById: (...args: any[]) => mockGetEntityById(...args),
}));

const nistFramework = {
  frameworkId: 4,
  frameworkName: "NIST AI RMF",
  projectFrameworkId: 30,
};

const overviewData = {
  functions: [
    {
      function: "govern",
      title: "Govern",
      categories: [
        {
          id: 1,
          category_id: 1,
          description: "Cat 1",
          subcategories: [
            { id: 1, subcategory_id: 1, description: "Sub 1", status: "Implemented", owner: 3 },
            { id: 2, subcategory_id: 2, description: "Sub 2", status: "Not started", owner: null },
          ],
        },
      ],
    },
    {
      function: "map",
      title: "Map",
      categories: [],
    },
    {
      function: "measure",
      title: "Measure",
      categories: [],
    },
    {
      function: "manage",
      title: "Manage",
      categories: [],
    },
  ],
};

describe("NISTFunctionsOverviewCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows no data message when there is no NIST framework", async () => {
    renderWithProviders(<NISTFunctionsOverviewCard frameworksData={[]} />);
    await waitFor(() => {
      expect(screen.getByText("No NIST AI RMF data available.")).toBeInTheDocument();
    });
  });

  it("renders all four function cards with computed statistics", async () => {
    mockGetEntityById.mockResolvedValue({ data: overviewData });
    renderWithProviders(<NISTFunctionsOverviewCard frameworksData={[nistFramework]} />);
    await waitFor(() => {
      expect(screen.getAllByText("Govern").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("Map").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Measure").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Manage").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1/2").length).toBeGreaterThan(0);
    expect(screen.getAllByText("subcategories implemented").length).toBeGreaterThan(0);
    expect(screen.getAllByText("assigned").length).toBeGreaterThan(0);
  });

  it("calls onNavigate when a function card chevron is clicked", async () => {
    mockGetEntityById.mockResolvedValue({ data: overviewData });
    const onNavigate = vi.fn();
    const user = userEvent.setup();
    const { container } = renderWithProviders(
      <NISTFunctionsOverviewCard frameworksData={[nistFramework]} onNavigate={onNavigate} />,
    );
    await waitFor(() => {
      expect(screen.getAllByText("Govern").length).toBeGreaterThan(0);
    });
    const chevron = container.querySelector("svg.lucide-chevron-right")?.closest("div");
    await user.click(chevron as Element);
    expect(onNavigate).toHaveBeenCalledWith("NIST AI RMF", "govern");
  });

  it("handles fetch error gracefully", async () => {
    mockGetEntityById.mockRejectedValue(new Error("network error"));
    renderWithProviders(<NISTFunctionsOverviewCard frameworksData={[nistFramework]} />);
    await waitFor(() => {
      expect(screen.getByText("No NIST AI RMF data available.")).toBeInTheDocument();
    });
  });

  it("renders empty placeholder squares when a function has no categories", async () => {
    mockGetEntityById.mockResolvedValue({ data: overviewData });
    renderWithProviders(<NISTFunctionsOverviewCard frameworksData={[nistFramework]} />);
    await waitFor(() => {
      expect(screen.getAllByText("Map").length).toBeGreaterThan(0);
    });
    expect(screen.getAllByText("0/0").length).toBeGreaterThan(0);
  });
});
