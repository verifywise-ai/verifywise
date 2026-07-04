import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ReadinessHeatmap from "../index";
import type { ControlReadinessScore } from "../../../../domain/interfaces/i.readiness";

const makeControl = (
  id: number,
  ctrlId: number,
  level: ControlReadinessScore["readiness_level"],
  score: number,
): ControlReadinessScore => ({
  id,
  control_id: ctrlId,
  framework_type: "eu_ai_act",
  project_id: 1,
  evidence_quality_score: score,
  evidence_count_score: score,
  evidence_recency_score: score,
  task_completion_score: score,
  risk_mitigation_score: score,
  overall_score: score,
  readiness_level: level,
  recommendations: [],
  calculated_at: "2024-01-01",
});

const mockControls: ControlReadinessScore[] = [
  makeControl(1, 101, "ready", 90),
  makeControl(2, 102, "ready", 85),
  makeControl(3, 103, "needs_work", 65),
  makeControl(4, 104, "at_risk", 45),
  makeControl(5, 105, "not_started", 15),
];

describe("ReadinessHeatmap", () => {
  it("shows loading state", () => {
    renderWithProviders(<ReadinessHeatmap controls={[]} frameworkType="eu_ai_act" isLoading />);
    expect(screen.getByText("Loading heatmap...")).toBeInTheDocument();
  });

  it("shows empty state when no controls", () => {
    renderWithProviders(<ReadinessHeatmap controls={[]} frameworkType="eu_ai_act" />);
    expect(screen.getByText("No readiness data. Run a calculation first.")).toBeInTheDocument();
  });

  it("renders known framework name in header", () => {
    renderWithProviders(<ReadinessHeatmap controls={mockControls} frameworkType="iso_42001" />);
    expect(screen.getByText(/ISO 42001/)).toBeInTheDocument();
  });

  it("renders unknown framework name as uppercase", () => {
    renderWithProviders(<ReadinessHeatmap controls={mockControls} frameworkType="custom_fw" />);
    expect(screen.getByText(/CUSTOM FW/)).toBeInTheDocument();
  });

  it("renders all control scores", () => {
    renderWithProviders(<ReadinessHeatmap controls={mockControls} frameworkType="eu_ai_act" />);
    expect(screen.getByText("90")).toBeInTheDocument();
    expect(screen.getByText("65")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("15")).toBeInTheDocument();
  });

  it("shows total control count in footer", () => {
    renderWithProviders(<ReadinessHeatmap controls={mockControls} frameworkType="eu_ai_act" />);
    expect(screen.getByText("5 controls evaluated")).toBeInTheDocument();
  });

  it("shows legend with all levels", () => {
    renderWithProviders(<ReadinessHeatmap controls={mockControls} frameworkType="eu_ai_act" />);
    expect(screen.getByText("Ready")).toBeInTheDocument();
    expect(screen.getByText("Needs Work")).toBeInTheDocument();
    expect(screen.getByText("At Risk")).toBeInTheDocument();
    expect(screen.getByText("Not Started")).toBeInTheDocument();
  });

  it("shows correct legend counts", () => {
    renderWithProviders(<ReadinessHeatmap controls={mockControls} frameworkType="eu_ai_act" />);
    expect(screen.getAllByText("1")).toHaveLength(3);
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders with single control", () => {
    renderWithProviders(
      <ReadinessHeatmap controls={[mockControls[0]]} frameworkType="eu_ai_act" />,
    );
    expect(screen.getByText("1 controls evaluated")).toBeInTheDocument();
  });
});
