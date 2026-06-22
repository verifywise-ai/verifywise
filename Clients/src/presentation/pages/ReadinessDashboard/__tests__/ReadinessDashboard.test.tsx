import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockScores = vi.fn();
const mockControlScores = vi.fn();
const mockWeakest = vi.fn();
const mockHistory = vi.fn();
const mockTriggerCalculate = vi.fn();

vi.mock("../../../../application/hooks/useReadiness", () => ({
  useReadinessScores: (...args: any[]) => mockScores(...args),
  useControlScores: (...args: any[]) => mockControlScores(...args),
  useWeakestControls: (...args: any[]) => mockWeakest(...args),
  useReadinessHistory: (...args: any[]) => mockHistory(...args),
  useTriggerCalculateAll: (...args: any[]) => mockTriggerCalculate(...args),
}));

vi.mock("../../../components/ReadinessHeatmap", () => ({
  default: () => <div data-testid="readiness-heatmap" />,
}));

vi.mock("../../../components/ReadinessTrend", () => ({
  default: () => <div data-testid="readiness-trend" />,
}));

vi.mock("../../../components/WeakControlsList", () => ({
  default: () => <div data-testid="weak-controls" />,
}));

vi.mock("../../../components/VisibilityToggle", () => ({
  VisibilityChips: () => <div data-testid="visibility-chips" />,
}));

import ReadinessDashboard from "../index";

const defaultScores = [
  {
    framework_type: "eu_ai_act",
    avg_score: 75,
    ready_count: 5,
    needs_work_count: 3,
    at_risk_count: 1,
    not_started_count: 2,
  },
  {
    framework_type: "iso_42001",
    avg_score: 45,
    ready_count: 2,
    needs_work_count: 2,
    at_risk_count: 4,
    not_started_count: 3,
  },
];

const defaultTriggerCalculate = {
  mutate: vi.fn(),
  isPending: false,
};

describe("ReadinessDashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockScores.mockReturnValue({ data: defaultScores, isLoading: false });
    mockControlScores.mockReturnValue({ data: [], isLoading: false });
    mockWeakest.mockReturnValue({ data: [], isLoading: false });
    mockHistory.mockReturnValue({ data: [], isLoading: false });
    mockTriggerCalculate.mockReturnValue(defaultTriggerCalculate);
  });

  it("renders the page title and description", () => {
    renderWithProviders(<ReadinessDashboard />);
    expect(screen.getByText("Audit readiness")).toBeInTheDocument();
    expect(screen.getByText(/Per-control readiness scores/)).toBeInTheDocument();
    expect(screen.getByTestId("visibility-chips")).toBeInTheDocument();
  });

  it("renders framework score cards", () => {
    renderWithProviders(<ReadinessDashboard />);
    expect(screen.getAllByText("EU AI Act").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("ISO 42001").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("75")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
  });

  it("shows loading spinner for scores when loading", () => {
    mockScores.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<ReadinessDashboard />);
    expect(document.querySelector(".MuiCircularProgress-root")).toBeInTheDocument();
  });

  it("shows empty state when no scores", () => {
    mockScores.mockReturnValue({ data: [], isLoading: false });
    renderWithProviders(<ReadinessDashboard />);
    expect(screen.getByText(/No readiness scores yet/)).toBeInTheDocument();
  });

  it("renders readiness level labels in score cards", () => {
    renderWithProviders(<ReadinessDashboard />);
    expect(screen.getAllByText("Needs work").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("At risk").length).toBeGreaterThanOrEqual(1);
  });

  it("renders framework tabs", () => {
    renderWithProviders(<ReadinessDashboard />);
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(2);
    expect(tabs[0]).toHaveTextContent("EU AI Act");
    expect(tabs[1]).toHaveTextContent("ISO 42001");
  });

  it("renders heatmap, trend, and weak controls components", () => {
    renderWithProviders(<ReadinessDashboard />);
    expect(screen.getByTestId("readiness-heatmap")).toBeInTheDocument();
    expect(screen.getByTestId("readiness-trend")).toBeInTheDocument();
    expect(screen.getByTestId("weak-controls")).toBeInTheDocument();
  });

  it("renders calculate readiness button", () => {
    renderWithProviders(<ReadinessDashboard />);
    expect(screen.getByText("Calculate readiness")).toBeInTheDocument();
  });

  it("calls triggerCalculate on button click", async () => {
    const mutate = vi.fn();
    mockTriggerCalculate.mockReturnValue({ mutate, isPending: false });
    const user = userEvent.setup();
    renderWithProviders(<ReadinessDashboard />);
    await user.click(screen.getByText("Calculate readiness"));
    expect(mutate).toHaveBeenCalledWith({ visibility: "public" });
  });

  it("shows calculating state on button when pending", () => {
    mockTriggerCalculate.mockReturnValue({
      mutate: vi.fn(),
      isPending: true,
    });
    renderWithProviders(<ReadinessDashboard />);
    expect(screen.getByText("Calculating...")).toBeInTheDocument();
    expect(screen.queryByText("Calculate readiness")).not.toBeInTheDocument();
  });
});
