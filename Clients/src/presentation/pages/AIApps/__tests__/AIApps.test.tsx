import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { AiAppStatus } from "../../../../domain/enums/aiApp.enum";

// Mock the AI Apps repository/hooks dependencies
const mockUseAiApps = vi.fn();

vi.mock("../../../../application/hooks/useAiAppLifecycle", () => ({
  useAiAppStageCounts: () => ({
    summary: {
      data: {
        counts: { in_review: 1, planned: 4, live: 2, retired: 0 },
        stale_ids: [1],
        confirmation_interval_days: 90,
      },
      isLoading: false,
    },
    counts: {
      in_review: 1 + ((mockPending.total as number) ?? 0),
      planned: 4,
      live: 2,
      retired: 0,
    },
    pending: mockPending,
  }),
}));

const emptyPending = { total: 0, items: [], limit: 500 };
let mockPending: Record<string, unknown> = emptyPending;

const listResult = {
  data: {
    ai_apps: [
      {
        id: 1,
        name: "ChatGPT",
        status: AiAppStatus.APPROVED,
        discovered_source: "manual",
        risk_score: 25,
      },
    ],
    total: 1,
  },
  isLoading: false,
  error: null,
};

vi.mock("../../../../application/hooks/useAiApps", async () => ({
  aiAppQueryKeys: { all: ["aiApps"] },
  useAiApps: (...args: unknown[]) => mockUseAiApps(...args),
  useDeleteAiApp: vi.fn().mockReturnValue({
    mutateAsync: vi.fn().mockResolvedValue({}),
    isPending: false,
  }),
}));

// Mock PageHeaderExtended
vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

// Mock NewAIApp modal
vi.mock("../../../components/Modals/NewAIApp", () => ({
  default: () => <div data-testid="new-ai-app-modal" />,
}));

import AIApps from "../index";

describe("AIApps page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    mockUseAiApps.mockReturnValue(listResult);
    mockPending = emptyPending;
  });

  it("renders the AI Apps catalog", () => {
    renderWithProviders(<AIApps />, { route: "/ai-apps" });

    expect(screen.getByTestId("page-header")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });

  it("shows lifecycle tabs with server counts and lists the selected stage", () => {
    renderWithProviders(<AIApps />, { route: "/ai-apps?stage=live" });

    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      expect.stringContaining("In review"),
      expect.stringContaining("Planned"),
      expect.stringContaining("Live"),
      expect.stringContaining("Retired"),
    ]);
    expect(tabs[1].textContent).toContain("4");
    expect(tabs[2].textContent).toContain("2");
    // One server page of the selected stage, not a client slice of 20 rows.
    expect(mockUseAiApps).toHaveBeenCalledWith(
      expect.objectContaining({ lifecycleStage: "live", page: 1, limit: 10 }),
    );
    // ChatGPT (id 1) is in the stale list.
    expect(screen.getByTestId("lifecycle-stale-marker")).toBeInTheDocument();
  });

  it("counts and lists pending AI app intake requests in In review", () => {
    mockPending = {
      total: 2,
      limit: 500,
      items: [
        {
          id: 7,
          title: "Meeting notes assistant",
          form_name: "AI app request",
          submitter_name: "Sam",
          submitted_at: "2026-10-29T09:00:00.000Z",
          days_in_review: 2,
        },
      ],
    };
    renderWithProviders(<AIApps />, { route: "/ai-apps?stage=in_review" });

    // 1 AI app in review + 2 requests.
    expect(screen.getAllByRole("tab")[0].textContent).toContain("3");
    expect(screen.getByTestId("pending-intake-submissions")).toBeInTheDocument();
    expect(screen.getByText("Meeting notes assistant")).toBeInTheDocument();
  });

  it("does not list requests outside In review", () => {
    mockPending = { ...emptyPending, total: 1 };
    renderWithProviders(<AIApps />, { route: "/ai-apps?stage=planned" });
    expect(screen.queryByTestId("pending-intake-submissions")).toBeNull();
  });
});
