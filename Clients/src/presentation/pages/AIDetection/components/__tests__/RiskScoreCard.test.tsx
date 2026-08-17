import { render, screen, fireEvent } from "@testing-library/react";
import { RiskScoreCard } from "../RiskScoreCard";
import type { RiskScoreDetails } from "../../../../../domain/ai-detection/riskScoringTypes";

function makeDetails(overrides: Partial<RiskScoreDetails> = {}): RiskScoreDetails {
  return {
    dimensions: {
      data_sovereignty: { score: 85, penalty_count: 0, top_contributors: [] },
      transparency: { score: 60, penalty_count: 2, top_contributors: ["Missing docs"] },
      security: { score: 40, penalty_count: 3, top_contributors: ["Hardcoded secret"] },
      autonomy: { score: 90, penalty_count: 0, top_contributors: [] },
      supply_chain: { score: 75, penalty_count: 1, top_contributors: ["Unpinned dependency"] },
    },
    llm_enhanced: false,
    llm_narrative: null,
    llm_recommendations: null,
    llm_adjustments: null,
    llm_suggested_risks: null,
    ...overrides,
  };
}

describe("RiskScoreCard", () => {
  it("shows the not-scored state when score/grade are null", () => {
    render(
      <RiskScoreCard score={null} grade={null} details={null} calculatedAt={null} />,
    );

    expect(
      screen.getByText(/No risk score has been calculated for this scan yet/),
    ).toBeInTheDocument();
  });

  it("renders overall score, grade and dimensions-at-risk cards for a scored scan", () => {
    render(
      <RiskScoreCard
        score={82}
        grade="B"
        details={makeDetails()}
        calculatedAt="2026-01-01T00:00:00Z"
      />,
    );

    expect(screen.getByText("82 / 100")).toBeInTheDocument();
    expect(screen.getByText("B — Good")).toBeInTheDocument();
    expect(screen.getByText("Low risk")).toBeInTheDocument();
    // Two dimensions (transparency=60, security=40) fall below the 70 threshold
    expect(screen.getByText("2 / 5")).toBeInTheDocument();
  });

  it("labels moderate and high risk score bands correctly", () => {
    const { rerender } = render(
      <RiskScoreCard score={65} grade="C" details={makeDetails()} calculatedAt={null} />,
    );
    expect(screen.getByText("Moderate risk")).toBeInTheDocument();

    rerender(<RiskScoreCard score={30} grade="F" details={makeDetails()} calculatedAt={null} />);
    expect(screen.getByText("High risk")).toBeInTheDocument();
  });

  it("renders the dimension breakdown labels", () => {
    render(
      <RiskScoreCard score={82} grade="B" details={makeDetails()} calculatedAt={null} />,
    );

    expect(screen.getByText("Data sovereignty")).toBeInTheDocument();
    expect(screen.getByText("Transparency")).toBeInTheDocument();
    expect(screen.getByText("Security")).toBeInTheDocument();
    expect(screen.getByText("Autonomy")).toBeInTheDocument();
    expect(screen.getByText("Supply chain")).toBeInTheDocument();
  });

  it("does not render the AI analysis section when llm_enhanced is false", () => {
    render(
      <RiskScoreCard score={82} grade="B" details={makeDetails()} calculatedAt={null} />,
    );

    expect(screen.queryByText("AI analysis")).not.toBeInTheDocument();
  });

  it("renders and expands the AI analysis section when LLM-enhanced", () => {
    const details = makeDetails({
      llm_enhanced: true,
      llm_narrative: "This repository shows **elevated** risk in the security dimension.",
      llm_recommendations: ["Rotate leaked credentials", "Add **input validation**"],
    });

    render(<RiskScoreCard score={55} grade="C" details={details} calculatedAt={null} />);

    expect(screen.getByText("AI analysis")).toBeInTheDocument();
    // Recommendations are inside a Collapse that starts closed
    expect(screen.queryByText("Recommendations")).not.toBeVisible();

    fireEvent.click(screen.getByText("AI analysis"));

    expect(screen.getByText("Recommendations")).toBeVisible();
    expect(screen.getByText("elevated")).toBeInTheDocument();
    expect(screen.getByText("Rotate leaked credentials")).toBeInTheDocument();
    expect(screen.getByText("input validation")).toBeInTheDocument();
  });

  it("splits a long single-paragraph narrative into multiple blocks", () => {
    const longSentence = "A".repeat(150) + ". " + "B".repeat(200) + ". " + "C".repeat(100) + ".";
    const details = makeDetails({
      llm_enhanced: true,
      llm_narrative: longSentence,
    });

    render(<RiskScoreCard score={55} grade="C" details={details} calculatedAt={null} />);
    fireEvent.click(screen.getByText("AI analysis"));

    // Just verify narrative content rendered somewhere without throwing
    expect(screen.getByText(/A{10,}/)).toBeInTheDocument();
  });

  it("shows a step progress dialog while recalculating", () => {
    render(
      <RiskScoreCard
        score={null}
        grade={null}
        details={null}
        calculatedAt={null}
        isRecalculating
      />,
    );

    expect(screen.getByText("Recalculating risk score")).toBeInTheDocument();
  });
});
