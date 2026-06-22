import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ReadinessScoreCard from "../index";

describe("ReadinessScoreCard", () => {
  it("shows loading spinner when isLoading is true", () => {
    const { container } = renderWithProviders(
      <ReadinessScoreCard frameworkType="eu_ai_act" overallScore={null} isLoading />,
    );
    expect(container.querySelector(".MuiLinearProgress-root")).toBeInTheDocument();
  });

  it("renders known framework name", () => {
    renderWithProviders(<ReadinessScoreCard frameworkType="eu_ai_act" overallScore={85} />);
    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
  });

  it("renders iso framework name", () => {
    renderWithProviders(<ReadinessScoreCard frameworkType="iso_42001" overallScore={50} />);
    expect(screen.getByText("ISO 42001")).toBeInTheDocument();
  });

  it("renders unknown framework type as uppercase", () => {
    renderWithProviders(<ReadinessScoreCard frameworkType="custom_framework" overallScore={50} />);
    expect(screen.getByText("CUSTOM FRAMEWORK")).toBeInTheDocument();
  });

  it("displays score number", () => {
    renderWithProviders(<ReadinessScoreCard frameworkType="eu_ai_act" overallScore={72} />);
    expect(screen.getByText("72")).toBeInTheDocument();
  });

  it("displays readiness level label", () => {
    renderWithProviders(<ReadinessScoreCard frameworkType="eu_ai_act" overallScore={72} />);
    expect(screen.getByText("Needs Work")).toBeInTheDocument();
  });

  it("shows Ready level when score >= 80", () => {
    renderWithProviders(<ReadinessScoreCard frameworkType="eu_ai_act" overallScore={92} />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("shows At Risk level when score >= 30 and < 60", () => {
    renderWithProviders(<ReadinessScoreCard frameworkType="eu_ai_act" overallScore={45} />);
    expect(screen.getByText("At Risk")).toBeInTheDocument();
  });

  it("shows Not Started level when score < 30", () => {
    renderWithProviders(<ReadinessScoreCard frameworkType="eu_ai_act" overallScore={15} />);
    expect(screen.getByText("Not Started")).toBeInTheDocument();
  });

  it("uses provided readinessLevel over classifyScore", () => {
    renderWithProviders(
      <ReadinessScoreCard
        frameworkType="eu_ai_act"
        overallScore={92}
        readinessLevel="not_started"
      />,
    );
    expect(screen.getByText("Not Started")).toBeInTheDocument();
  });

  it("defaults score to 0 when overallScore is null", () => {
    renderWithProviders(<ReadinessScoreCard frameworkType="eu_ai_act" overallScore={null} />);
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("shows control counts when totalControls is provided", () => {
    renderWithProviders(
      <ReadinessScoreCard
        frameworkType="eu_ai_act"
        overallScore={65}
        totalControls={10}
        readyCount={3}
        needsWorkCount={4}
        atRiskCount={2}
        notStartedCount={1}
      />,
    );
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("4")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("shows control count labels when totalControls is provided", () => {
    renderWithProviders(
      <ReadinessScoreCard
        frameworkType="eu_ai_act"
        overallScore={65}
        totalControls={5}
        readyCount={2}
      />,
    );
    expect(screen.getByText("Ready")).toBeInTheDocument();
  });

  it("hides control counts section when totalControls is null", () => {
    renderWithProviders(
      <ReadinessScoreCard frameworkType="eu_ai_act" overallScore={65} totalControls={null} />,
    );
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("hides control counts section when totalControls is undefined", () => {
    renderWithProviders(<ReadinessScoreCard frameworkType="eu_ai_act" overallScore={65} />);
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });

  it("shows dimension breakdown with labels when provided", () => {
    renderWithProviders(
      <ReadinessScoreCard
        frameworkType="eu_ai_act"
        overallScore={70}
        breakdown={{
          evidence_quality: 80,
          evidence_count: 60,
          evidence_recency: 40,
          task_completion: 90,
          risk_mitigation: 20,
        }}
      />,
    );
    expect(screen.getByText(/Evidence Quality/)).toBeInTheDocument();
    expect(screen.getByText(/Evidence Count/)).toBeInTheDocument();
    expect(screen.getByText(/Evidence Recency/)).toBeInTheDocument();
    expect(screen.getByText(/Task Completion/)).toBeInTheDocument();
    expect(screen.getByText(/Risk Mitigation/)).toBeInTheDocument();
  });

  it("shows dimension weights inline with labels", () => {
    renderWithProviders(
      <ReadinessScoreCard
        frameworkType="eu_ai_act"
        overallScore={70}
        breakdown={{
          evidence_quality: 80,
          evidence_count: 60,
          evidence_recency: 40,
          task_completion: 90,
          risk_mitigation: 20,
        }}
      />,
    );
    expect(screen.getByText(/\(30%\)/)).toBeInTheDocument();
  });

  it("shows dimension values", () => {
    renderWithProviders(
      <ReadinessScoreCard
        frameworkType="eu_ai_act"
        overallScore={70}
        breakdown={{
          evidence_quality: 75,
          evidence_count: 60,
          evidence_recency: 40,
          task_completion: 90,
          risk_mitigation: 20,
        }}
      />,
    );
    expect(screen.getByText("75")).toBeInTheDocument();
  });

  it("hides dimension breakdown when not provided", () => {
    renderWithProviders(<ReadinessScoreCard frameworkType="eu_ai_act" overallScore={70} />);
    expect(screen.queryByText("Evidence Quality")).not.toBeInTheDocument();
  });
});
