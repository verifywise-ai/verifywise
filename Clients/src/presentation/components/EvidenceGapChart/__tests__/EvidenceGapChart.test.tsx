import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EvidenceGapChart from "../index";

const mockData = {
  total_controls: 100,
  controls_without_evidence: 20,
  controls_with_low_quality: 15,
  controls_adequate: 65,
  quality_threshold: 70,
  gaps: [
    {
      framework_type: "eu_ai_act",
      control_id: 1,
      control_title: "Risk Management",
      evidence_count: 0,
      avg_quality: 0,
      gap_type: "no_evidence" as const,
    },
    {
      framework_type: "iso_42001",
      control_id: 2,
      control_title: "Data Governance",
      evidence_count: 2,
      avg_quality: 45,
      gap_type: "low_quality" as const,
    },
  ],
};

describe("EvidenceGapChart", () => {
  it("renders loading state", () => {
    renderWithProviders(<EvidenceGapChart data={null} isLoading />);
    expect(document.querySelector(".MuiLinearProgress-root")).toBeInTheDocument();
  });

  it("renders empty state when data is null", () => {
    renderWithProviders(<EvidenceGapChart data={null} />);
    expect(screen.getByText("No control data available for gap analysis.")).toBeInTheDocument();
  });

  it("renders empty state when total_controls is 0", () => {
    renderWithProviders(
      <EvidenceGapChart
        data={{
          total_controls: 0,
          controls_without_evidence: 0,
          controls_with_low_quality: 0,
          controls_adequate: 0,
          quality_threshold: 70,
          gaps: [],
        }}
      />,
    );
    expect(screen.getByText("No control data available for gap analysis.")).toBeInTheDocument();
  });

  it("renders title and coverage bars", () => {
    renderWithProviders(<EvidenceGapChart data={mockData} />);
    expect(screen.getByText("Evidence Coverage")).toBeInTheDocument();
    expect(screen.getByText("Adequate Evidence")).toBeInTheDocument();
    expect(screen.getByText("Low Quality Evidence")).toBeInTheDocument();
    expect(screen.getByText("No Evidence")).toBeInTheDocument();
  });

  it("shows coverage counts with percentages", () => {
    renderWithProviders(<EvidenceGapChart data={mockData} />);
    expect(screen.getByText("65 (65%)")).toBeInTheDocument();
    expect(screen.getByText("15 (15%)")).toBeInTheDocument();
    expect(screen.getByText("20 (20%)")).toBeInTheDocument();
  });

  it("renders gap details when gaps exist", () => {
    renderWithProviders(<EvidenceGapChart data={mockData} />);
    expect(screen.getByText("Controls Needing Attention (2)")).toBeInTheDocument();
    expect(screen.getByText("Risk Management")).toBeInTheDocument();
    expect(screen.getByText("Data Governance")).toBeInTheDocument();
  });

  it("shows 'No evidence' for no_evidence gap type", () => {
    renderWithProviders(<EvidenceGapChart data={mockData} />);
    expect(screen.getByText("No evidence")).toBeInTheDocument();
  });

  it("shows quality score for low_quality gap type", () => {
    renderWithProviders(<EvidenceGapChart data={mockData} />);
    expect(screen.getByText("Quality: 45")).toBeInTheDocument();
  });

  it("does not render gap details when gaps array is empty", () => {
    renderWithProviders(<EvidenceGapChart data={{ ...mockData, gaps: [] }} />);
    expect(screen.queryByText("Controls Needing Attention (0)")).not.toBeInTheDocument();
  });

  it("shows quality threshold note", () => {
    renderWithProviders(<EvidenceGapChart data={mockData} />);
    expect(screen.getByText("Quality threshold: 70/100")).toBeInTheDocument();
  });

  it("limits gap details to 8 items", () => {
    const manyGaps = Array.from({ length: 12 }, (_, i) => ({
      framework_type: "eu_ai_act",
      control_id: i + 1,
      control_title: `Control ${i + 1}`,
      evidence_count: 0,
      avg_quality: 0,
      gap_type: "no_evidence" as const,
    }));
    renderWithProviders(<EvidenceGapChart data={{ ...mockData, gaps: manyGaps }} />);
    expect(screen.getByText("Controls Needing Attention (12)")).toBeInTheDocument();
    expect(screen.getByText("Control 1")).toBeInTheDocument();
    expect(screen.getByText("Control 8")).toBeInTheDocument();
    expect(screen.queryByText("Control 9")).not.toBeInTheDocument();
  });
});
