import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";

const mockScores = vi.fn();
const mockControlScores = vi.fn();
const mockWeakest = vi.fn();
const mockHistory = vi.fn();
const mockTriggerCalculate = vi.fn();
const mockTriggerCalculateFramework = vi.fn();
const mockDelete = vi.fn();
const mockCan = vi.fn();

vi.mock("../../../../application/hooks/useReadiness", () => ({
  useReadinessScores: (...args: any[]) => mockScores(...args),
  useControlScores: (...args: any[]) => mockControlScores(...args),
  useWeakestControls: (...args: any[]) => mockWeakest(...args),
  useReadinessHistory: (...args: any[]) => mockHistory(...args),
  useTriggerCalculateAll: (...args: any[]) => mockTriggerCalculate(...args),
  useTriggerCalculateFramework: (...args: any[]) => mockTriggerCalculateFramework(...args),
  useDeleteReadinessCalculation: () => ({ mutate: mockDelete, isPending: false }),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

vi.mock("../../../../application/hooks/useCan", () => ({
  useCan: (key: string) => mockCan(key),
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
    mockTriggerCalculateFramework.mockReturnValue({ mutate: vi.fn(), isPending: false });
    mockCan.mockReturnValue(false);
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

  // framework_readiness_scores keys its upsert on created_by, so the same
  // framework comes back once per user that has calculated it.
  const twoUsersSameFramework = [
    {
      id: 1,
      framework_type: "eu_ai_act",
      project_id: 1,
      created_by: 2,
      avg_score: 29,
      calculated_at: "2026-07-28T18:07:14.235Z",
    },
    {
      id: 6,
      framework_type: "eu_ai_act",
      project_id: 1,
      created_by: 1,
      avg_score: 36,
      calculated_at: "2026-07-30T14:05:35.633Z",
    },
  ];

  it("renders one card per framework when two users have scored the same framework", () => {
    mockScores.mockReturnValue({ data: twoUsersSameFramework, isLoading: false });
    // Scoped mode hides the framework tabs, so "EU AI Act" here is the card title.
    renderWithProviders(<ReadinessDashboard projectId={1} frameworkType="eu_ai_act" />);
    expect(screen.getAllByText("EU AI Act")).toHaveLength(1);
    expect(screen.getByText("36")).toBeInTheDocument();
    expect(screen.queryByText("29")).not.toBeInTheDocument();
  });

  it("dedupes on the org-wide path too, keeping the newest regardless of API order", () => {
    // getFrameworkScoresQuery sorts by avg_score ASC, not by recency, so the
    // newest row is not reliably last.
    mockScores.mockReturnValue({
      data: [...twoUsersSameFramework].reverse(),
      isLoading: false,
    });
    renderWithProviders(<ReadinessDashboard />);
    expect(screen.getByText("36")).toBeInTheDocument();
    expect(screen.queryByText("29")).not.toBeInTheDocument();
  });

  it("shows loading skeleton for scores when loading", () => {
    mockScores.mockReturnValue({ data: undefined, isLoading: true });
    renderWithProviders(<ReadinessDashboard />);
    expect(document.querySelector(".MuiSkeleton-root")).toBeInTheDocument();
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
    // The default All chip names no visibility, so an existing calculation
    // keeps its own and a private one is never shared unasked.
    expect(mutate).toHaveBeenCalledWith({ visibility: undefined });
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

  describe("deleting a calculation", () => {
    const card = (overrides: Record<string, unknown>) => ({
      id: 7,
      framework_type: "eu_ai_act",
      project_id: 1,
      avg_score: 50,
      calculated_at: "2026-11-20T10:00:00.000Z",
      ...overrides,
    });
    const renderCard = (overrides: Record<string, unknown>) => {
      mockScores.mockReturnValue({ data: [card(overrides)], isLoading: false });
      renderWithProviders(<ReadinessDashboard projectId={1} frameworkType="eu_ai_act" />);
    };

    it("offers delete on your own calculation and marks a private one", () => {
      renderCard({ created_by: 1, visibility: "private" });
      expect(screen.getByTestId("readiness-delete-7")).toBeInTheDocument();
      expect(screen.getByText("Private")).toBeInTheDocument();
    });

    it("hides delete on someone else's public calculation without readiness.admin", () => {
      renderCard({ created_by: 2, visibility: "public" });
      expect(screen.queryByTestId("readiness-delete-7")).not.toBeInTheDocument();
      expect(mockCan).toHaveBeenCalledWith("readiness.admin");
    });

    it("offers delete on someone else's public calculation to readiness.admin", () => {
      mockCan.mockReturnValue(true);
      renderCard({ created_by: 2, visibility: "public" });
      expect(screen.getByTestId("readiness-delete-7")).toBeInTheDocument();
    });

    it("never offers delete on someone else's private calculation", () => {
      mockCan.mockReturnValue(true);
      renderCard({ created_by: 2, visibility: "private" });
      expect(screen.queryByTestId("readiness-delete-7")).not.toBeInTheDocument();
    });

    it("deletes only after confirming", async () => {
      const user = userEvent.setup();
      renderCard({ created_by: 1, visibility: "public" });
      await user.click(screen.getByTestId("readiness-delete-7"));
      expect(mockDelete).not.toHaveBeenCalled();
      expect(screen.getByText("Delete this calculation?")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Delete" }));
      expect(mockDelete).toHaveBeenCalledWith(7, expect.any(Object));
    });

    it("keeps the dialog open when the delete fails and closes it once it succeeds", async () => {
      const user = userEvent.setup();
      renderCard({ created_by: 1, visibility: "public" });
      await user.click(screen.getByTestId("readiness-delete-7"));
      await user.click(screen.getByRole("button", { name: "Delete" }));
      // A failed mutation never calls onSuccess.
      expect(screen.getByText("Delete this calculation?")).toBeInTheDocument();
      const [, options] = mockDelete.mock.calls[0];
      act(() => options.onSuccess());
      await waitFor(() =>
        expect(screen.queryByText("Delete this calculation?")).not.toBeInTheDocument(),
      );
    });

    it("shows your own calculation over a colleague's newer one, so you can delete it", () => {
      mockScores.mockReturnValue({
        data: [
          card({ id: 7, created_by: 1, avg_score: 41, calculated_at: "2026-11-01T10:00:00.000Z" }),
          card({ id: 8, created_by: 2, avg_score: 88, calculated_at: "2026-11-20T10:00:00.000Z" }),
        ],
        isLoading: false,
      });
      renderWithProviders(<ReadinessDashboard projectId={1} frameworkType="eu_ai_act" />);
      expect(screen.getByText("41")).toBeInTheDocument();
      expect(screen.queryByText("88")).not.toBeInTheDocument();
      expect(screen.getByTestId("readiness-delete-7")).toBeInTheDocument();
    });
  });

  describe("scoped to a use case and framework", () => {
    const scopedProps = { projectId: 7, frameworkType: "iso_42001" };

    it("scopes every query to the project and framework", () => {
      renderWithProviders(<ReadinessDashboard {...scopedProps} />);
      expect(mockScores).toHaveBeenCalledWith(7, undefined);
      expect(mockControlScores).toHaveBeenCalledWith("iso_42001", {
        projectId: 7,
        visibility: undefined,
      });
      expect(mockWeakest).toHaveBeenCalledWith(10, 7, undefined);
      expect(mockHistory).toHaveBeenCalledWith("iso_42001", 7, undefined);
    });

    it("hides the framework tabs and the page title", () => {
      renderWithProviders(<ReadinessDashboard {...scopedProps} />);
      expect(screen.queryAllByRole("tab")).toHaveLength(0);
      expect(screen.queryByText("Audit readiness")).not.toBeInTheDocument();
    });

    it("shows a score card only for the pinned framework", () => {
      renderWithProviders(<ReadinessDashboard {...scopedProps} />);
      expect(screen.getByText("ISO 42001")).toBeInTheDocument();
      expect(screen.queryByText("EU AI Act")).not.toBeInTheDocument();
    });

    it("recalculates only the pinned framework for this project", async () => {
      const mutate = vi.fn();
      mockTriggerCalculateFramework.mockReturnValue({ mutate, isPending: false });
      const user = userEvent.setup();
      renderWithProviders(<ReadinessDashboard {...scopedProps} />);
      await user.click(screen.getByText("Calculate readiness"));
      expect(mutate).toHaveBeenCalledWith({
        frameworkType: "iso_42001",
        projectId: 7,
        visibility: undefined,
      });
    });
  });
});
