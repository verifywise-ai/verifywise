import { screen, fireEvent, waitFor } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ScoreSection, { type ScoreSectionProps } from "../assessment/ScoreSection";
import type { RiskAssessmentV2 } from "../../../../application/repository/intakeForm.repository";

const assessment = (overrides: Partial<RiskAssessmentV2> = {}): RiskAssessmentV2 => ({
  version: 2,
  status: "complete",
  notRuleChecked: false,
  classificationLevel: "High risk",
  ruleMinimum: 70,
  ai: {
    runs: [60, 62, 64, 66, 71],
    failedRuns: 0,
    validRuns: 5,
    median: 64,
    min: 60,
    max: 71,
    reasons: [{ text: "Screens job applicants", questionId: "q1", excerpt: "job applicants" }],
  },
  finalScore: 70,
  source: "rule_minimum",
  rulesOnly: false,
  overallScore: 70,
  tier: "High",
  stageStartedAt: "2026-10-21T10:00:00.000Z",
  scoredAt: "2026-10-21T10:01:00.000Z",
  ...overrides,
});

const render = (props: Partial<ScoreSectionProps> = {}) =>
  renderWithProviders(
    <ScoreSection
      assessment={assessment()}
      selectedLevel="High risk"
      rulesLevel="High risk"
      assessedLevel="High risk"
      isModel={false}
      questionLabels={{ q1: "Purpose" }}
      onRetry={vi.fn().mockResolvedValue(undefined)}
      retryAvailable={false}
      {...props}
    />,
  );

describe("ScoreSection", () => {
  it("shows the number, its band, the AI range and what set the score", () => {
    render();
    expect(screen.getByTestId("intake-score")).toHaveTextContent("70");
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("AI scores ranged")).toBeInTheDocument();
    expect(screen.getByText("60–71")).toBeInTheDocument();
    expect(
      screen.getByText("The rule minimum set this score. The AI scored it lower."),
    ).toBeInTheDocument();
    expect(screen.getByText("Screens job applicants")).toBeInTheDocument();
    expect(screen.getByText('"job applicants" (Purpose)')).toBeInTheDocument();
  });

  it("says when the AI median set the score", () => {
    render({
      assessment: assessment({
        ai: { ...assessment().ai!, median: 82, min: 80, max: 85 },
      }),
    });
    expect(screen.getByTestId("intake-score")).toHaveTextContent("82");
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getByText("The AI median set this score.")).toBeInTheDocument();
  });

  it("shows Scoring… while pending", () => {
    render({ assessment: assessment({ status: "pending" }) });
    expect(screen.getByText("Scoring…")).toBeInTheDocument();
    expect(screen.queryByTestId("intake-score")).toBeNull();
  });

  it("shows a rules-only score as at least N", () => {
    render({ assessment: assessment({ status: "ai_not_configured", ai: null }) });
    expect(screen.getByText("at least")).toBeInTheDocument();
    expect(screen.getByText("(rules only)")).toBeInTheDocument();
    expect(screen.getByText("AI scoring isn't set up for this form.")).toBeInTheDocument();
  });

  it("shows No score yet without AI and without a minimum", () => {
    render({
      assessment: assessment({ status: "ai_not_configured", ai: null, notRuleChecked: true }),
      selectedLevel: null,
      rulesLevel: null,
      assessedLevel: null,
    });
    expect(screen.getByText("No score yet")).toBeInTheDocument();
    expect(
      screen.getByText("Not rule-checked. This form doesn't ask the EU AI Act questions."),
    ).toBeInTheDocument();
  });

  it("explains model submissions are not rule-checked", () => {
    render({ isModel: true, selectedLevel: null, rulesLevel: null, assessedLevel: null });
    expect(
      screen.getByText("Not rule-checked. EU AI Act questions apply to use cases, not models."),
    ).toBeInTheDocument();
    expect(screen.getByTestId("intake-score")).toHaveTextContent("64");
  });

  it("shows the failure note and Retry, which calls onRetry", async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render({ assessment: assessment({ status: "ai_failed" }), retryAvailable: true, onRetry });
    expect(
      screen.getByText("AI scoring failed. The score shown comes from the rules only."),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("intake-score-retry"));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });

  it("offers Retry when the job never ran", async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render({ assessment: null, retryAvailable: true, onRetry });
    expect(screen.getByText("Scoring…")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("intake-score-retry"));
    await waitFor(() => expect(onRetry).toHaveBeenCalledTimes(1));
  });

  it("hides Retry when nothing can be retried", () => {
    render({ assessment: assessment({ status: "ai_failed" }) });
    expect(screen.queryByTestId("intake-score-retry")).toBeNull();
  });

  it("recomputes for the reviewer's level change", () => {
    render({
      assessment: assessment({
        ai: { ...assessment().ai!, median: 40, min: 35, max: 45 },
        finalScore: 70,
      }),
      selectedLevel: "Prohibited",
    });
    expect(screen.getByTestId("intake-score")).toHaveTextContent("90");
    expect(screen.getByText("Critical")).toBeInTheDocument();
    expect(screen.getAllByText("Minimum based on your level change").length).toBeGreaterThan(0);
  });

  it("flags rules that changed since scoring", () => {
    render({
      rulesLevel: "Limited risk",
      selectedLevel: "Limited risk",
      assessedLevel: "High risk",
    });
    expect(screen.getByText("Rules updated since this was scored")).toBeInTheDocument();
  });

  it("explains how the score is built", () => {
    render({
      assessment: assessment({ ai: { ...assessment().ai!, runs: [60, 64, 71], failedRuns: 2 } }),
      override: { tier: "Critical", justification: "Vulnerable users", byName: "Elena Moreau" },
    });
    fireEvent.click(screen.getByText("How this score is built"));
    expect(
      screen.getByText(
        "The final score is the higher of the rule minimum and the AI median. The AI can raise the score but never lower it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByText("failed")).toHaveLength(2);
    expect(screen.getByText("Vulnerable users")).toBeInTheDocument();
    expect(screen.getAllByText("Elena Moreau", { exact: false }).length).toBeGreaterThan(0);
  });
});
