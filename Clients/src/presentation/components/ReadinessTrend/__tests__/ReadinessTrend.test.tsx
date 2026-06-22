import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ReadinessTrend from "../index";
import type { FrameworkReadinessScore } from "../../../../domain/interfaces/i.readiness";

const mockData: FrameworkReadinessScore[] = [
  {
    id: 1,
    framework_type: "eu_ai_act",
    project_id: 1,
    total_controls: 10,
    avg_score: 85,
    ready_count: 5,
    needs_work_count: 3,
    at_risk_count: 1,
    not_started_count: 1,
    weakest_controls: [],
    calculated_at: "2024-01-15T10:30:00",
  },
  {
    id: 2,
    framework_type: "iso_42001",
    project_id: 1,
    total_controls: 8,
    avg_score: 45,
    ready_count: 1,
    needs_work_count: 2,
    at_risk_count: 3,
    not_started_count: 2,
    weakest_controls: [],
    calculated_at: "2024-01-10T08:00:00",
  },
];

describe("ReadinessTrend", () => {
  it("shows loading state", () => {
    const { container } = renderWithProviders(<ReadinessTrend data={[]} isLoading />);
    expect(container.querySelector(".MuiLinearProgress-root")).toBeInTheDocument();
  });

  it("shows empty state when no data", () => {
    renderWithProviders(<ReadinessTrend data={[]} />);
    expect(screen.getByText(/No readiness history available/)).toBeInTheDocument();
  });

  it("renders trend header", () => {
    renderWithProviders(<ReadinessTrend data={mockData} />);
    expect(screen.getByText("Readiness trend")).toBeInTheDocument();
  });

  it("renders known framework names", () => {
    renderWithProviders(<ReadinessTrend data={mockData} />);
    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
  });

  it("renders unknown framework type as uppercase", () => {
    const withUnknown = [
      ...mockData,
      { ...mockData[0], id: 3, framework_type: "custom_type", avg_score: 30 },
    ];
    renderWithProviders(<ReadinessTrend data={withUnknown} />);
    expect(screen.getByText("CUSTOM TYPE")).toBeInTheDocument();
  });

  it("renders scores with correct coloring", () => {
    renderWithProviders(<ReadinessTrend data={mockData} />);
    expect(screen.getByText("85")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
  });

  it("renders distribution counts for each item", () => {
    renderWithProviders(<ReadinessTrend data={mockData} />);
    expect(screen.getByText("5 ready")).toBeInTheDocument();
    expect(screen.getByText("3 needs work")).toBeInTheDocument();
    expect(screen.getByText("1 at risk")).toBeInTheDocument();
    expect(screen.getByText("1 not started")).toBeInTheDocument();
  });

  it("handles all-null scores and counts", () => {
    const nullData: FrameworkReadinessScore[] = [
      {
        id: 3,
        framework_type: "nist_ai_rmf",
        project_id: 1,
        total_controls: null,
        avg_score: null,
        ready_count: null,
        needs_work_count: null,
        at_risk_count: null,
        not_started_count: null,
        weakest_controls: null,
        calculated_at: "",
      },
    ];
    renderWithProviders(<ReadinessTrend data={nullData} />);
    expect(screen.getByText("NIST AI RMF")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
