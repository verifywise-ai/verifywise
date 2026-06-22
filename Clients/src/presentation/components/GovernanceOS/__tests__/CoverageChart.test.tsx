import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import CoverageChart from "../CoverageChart";
import type { IGovernanceCoverage } from "../../../../domain/interfaces/i.governanceOs";

const mockCoverage: IGovernanceCoverage[] = [
  {
    framework_id: 1,
    framework_name: "EU AI Act",
    total_controls: 20,
    mapped_controls: 15,
    coverage_percentage: 75,
    gap_details: { unmapped_controls: ["C1", "C2"] },
    synergy_details: { multi_framework_controls: ["C3"] },
  },
  {
    framework_id: 2,
    framework_name: "ISO 42001",
    total_controls: 10,
    mapped_controls: 10,
    coverage_percentage: 100,
    gap_details: { unmapped_controls: [] },
    synergy_details: { multi_framework_controls: [] },
  },
];

describe("CoverageChart", () => {
  it("shows empty state when no coverage data", () => {
    renderWithProviders(<CoverageChart coverage={[]} />);
    expect(screen.getByText(/No coverage data available/)).toBeInTheDocument();
  });

  it("shows empty state when coverage is null", () => {
    renderWithProviders(<CoverageChart coverage={null as unknown as IGovernanceCoverage[]} />);
    expect(screen.getByText(/No coverage data available/)).toBeInTheDocument();
  });

  it("renders framework names", () => {
    renderWithProviders(<CoverageChart coverage={mockCoverage} />);
    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
  });

  it("renders coverage percentages", () => {
    renderWithProviders(<CoverageChart coverage={mockCoverage} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("renders control mapping counts", () => {
    renderWithProviders(<CoverageChart coverage={mockCoverage} />);
    expect(screen.getByText("15/20 controls mapped")).toBeInTheDocument();
    expect(screen.getByText("10/10 controls mapped")).toBeInTheDocument();
  });

  it("shows gap chip when there are unmapped controls", () => {
    renderWithProviders(<CoverageChart coverage={mockCoverage} />);
    expect(screen.getByText("2 gaps")).toBeInTheDocument();
  });

  it("shows synergy chip when there are multi-framework controls", () => {
    renderWithProviders(<CoverageChart coverage={mockCoverage} />);
    expect(screen.getByText("1 synergies")).toBeInTheDocument();
  });

  it("does not show gap chip when no gaps exist", () => {
    renderWithProviders(<CoverageChart coverage={[mockCoverage[1]]} />);
    expect(screen.queryByText(/\d+ gaps/)).not.toBeInTheDocument();
  });

  it("does not show synergy chip when no synergies exist", () => {
    renderWithProviders(<CoverageChart coverage={[mockCoverage[1]]} />);
    expect(screen.queryByText(/\d+ synergies/)).not.toBeInTheDocument();
  });

  it("falls back to framework_id when framework_name is falsy", () => {
    const noName: IGovernanceCoverage = {
      ...mockCoverage[0],
      framework_name: "",
      framework_id: 5,
    };
    renderWithProviders(<CoverageChart coverage={[noName]} />);
    expect(screen.getByText("Framework 5")).toBeInTheDocument();
  });
});
