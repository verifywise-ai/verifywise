import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import EvidenceGapChart from "../index";

const mockData = {
  total_controls: 100,
  controls_without_evidence: 20,
  controls_with_low_quality: 15,
  controls_adequate: 65,
  low_grades: ["D", "F"],
  gaps: [
    {
      framework_type: "eu_ai_act",
      control_id: 1,
      control_title: "Risk management",
      evidence_count: 0,
      adequate_count: 0,
      gap_type: "no_evidence" as const,
    },
    {
      framework_type: "iso_42001",
      control_id: 2,
      control_title: "Data governance",
      evidence_count: 2,
      adequate_count: 0,
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
          low_grades: ["D", "F"],
          gaps: [],
        }}
      />,
    );
    expect(screen.getByText("No control data available for gap analysis.")).toBeInTheDocument();
  });

  it("renders title and coverage bars", () => {
    renderWithProviders(<EvidenceGapChart data={mockData} />);
    expect(screen.getByText("Evidence coverage")).toBeInTheDocument();
    expect(screen.getByText("Adequate evidence")).toBeInTheDocument();
    expect(screen.getByText("Low-quality evidence")).toBeInTheDocument();
    // "No evidence" is also the badge on a gap row, so the bar label is one of several
    expect(screen.getAllByText("No evidence").length).toBeGreaterThan(0);
  });

  it("shows coverage counts with percentages", () => {
    renderWithProviders(<EvidenceGapChart data={mockData} />);
    expect(screen.getByText("65 (65%)")).toBeInTheDocument();
    expect(screen.getByText("15 (15%)")).toBeInTheDocument();
    expect(screen.getByText("20 (20%)")).toBeInTheDocument();
  });

  it("names the framework each gap belongs to, since the list mixes them", () => {
    renderWithProviders(<EvidenceGapChart data={mockData} />);
    expect(screen.getByText("Controls needing attention (2)")).toBeInTheDocument();
    expect(screen.getByText(/EU AI Act · Risk management/)).toBeInTheDocument();
    expect(screen.getByText(/ISO 42001 · Data governance/)).toBeInTheDocument();
  });

  it("distinguishes a control with no evidence from one whose evidence is all low quality", () => {
    renderWithProviders(<EvidenceGapChart data={mockData} />);
    expect(screen.getAllByText("No evidence").length).toBeGreaterThan(0);
    expect(screen.getByText("2 files, none adequate")).toBeInTheDocument();
  });

  it("counts a single low-quality file in the singular", () => {
    renderWithProviders(
      <EvidenceGapChart
        data={{
          ...mockData,
          gaps: [{ ...mockData.gaps[1], evidence_count: 1 }],
        }}
      />,
    );
    expect(screen.getByText("1 file, none adequate")).toBeInTheDocument();
  });

  it("does not render gap details when gaps array is empty", () => {
    renderWithProviders(<EvidenceGapChart data={{ ...mockData, gaps: [] }} />);
    expect(screen.queryByText("Controls needing attention (0)")).not.toBeInTheDocument();
  });

  it("says which grades count as low quality", () => {
    renderWithProviders(<EvidenceGapChart data={{ ...mockData, low_grades: ["C", "D", "F"] }} />);
    expect(screen.getByText(/Evidence graded C, D, F counts as low quality/)).toBeInTheDocument();
  });

  it("falls back to the default grades when the API did not say", () => {
    const { low_grades: _ignored, ...withoutGrades } = mockData;
    renderWithProviders(<EvidenceGapChart data={withoutGrades} />);
    expect(screen.getByText(/Evidence graded D, F counts as low quality/)).toBeInTheDocument();
  });

  it("lists 8 gaps until asked for the rest", () => {
    const manyGaps = Array.from({ length: 12 }, (_, i) => ({
      framework_type: "eu_ai_act",
      control_id: i + 1,
      control_title: `Control ${i + 1}`,
      evidence_count: 0,
      adequate_count: 0,
      gap_type: "no_evidence" as const,
    }));
    renderWithProviders(<EvidenceGapChart data={{ ...mockData, gaps: manyGaps }} />);
    expect(screen.getByText("Controls needing attention (12)")).toBeInTheDocument();
    expect(screen.getByText(/Control 1$/)).toBeInTheDocument();
    expect(screen.getByText(/Control 8$/)).toBeInTheDocument();
    expect(screen.queryByText(/Control 9$/)).not.toBeInTheDocument();
  });

  it("can list every gap past the first 8, and collapse again", () => {
    const manyGaps = Array.from({ length: 12 }, (_, i) => ({
      framework_type: "eu_ai_act",
      control_id: i + 1,
      control_title: `Control ${i + 1}`,
      evidence_count: 0,
      adequate_count: 0,
      gap_type: "no_evidence" as const,
    }));
    renderWithProviders(<EvidenceGapChart data={{ ...mockData, gaps: manyGaps }} />);

    fireEvent.click(screen.getByRole("button", { name: "Show all 12" }));
    expect(screen.getByText(/Control 9$/)).toBeInTheDocument();
    expect(screen.getByText(/Control 12$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show fewer" }));
    expect(screen.queryByText(/Control 9$/)).not.toBeInTheDocument();
  });

  it("offers no toggle when every gap already fits", () => {
    renderWithProviders(<EvidenceGapChart data={mockData} />);
    expect(screen.queryByRole("button", { name: /Show all/ })).not.toBeInTheDocument();
  });
});
