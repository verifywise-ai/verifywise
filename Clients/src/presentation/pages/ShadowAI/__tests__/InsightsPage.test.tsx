import { screen, waitFor, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import {
  ShadowAiInsightsSummary,
  ShadowAiToolByEvents,
  ShadowAiToolByUsers,
  ShadowAiUsersByDepartment,
  IShadowAiTool,
} from "../../../../domain/interfaces/i.shadowAi";

const mockNavigate = vi.fn();
vi.mock("react-router", async () => {
  const actual: any = await vi.importActual("react-router");
  return { ...actual, useNavigate: () => mockNavigate };
});

const mockGetInsightsSummary = vi.fn();
const mockGetToolsByEvents = vi.fn();
const mockGetToolsByUsers = vi.fn();
const mockGetUsersByDepartment = vi.fn();
const mockGetTools = vi.fn();

vi.mock("../../../../application/repository/shadowAi.repository", () => ({
  getInsightsSummary: (...args: any[]) => mockGetInsightsSummary(...args),
  getToolsByEvents: (...args: any[]) => mockGetToolsByEvents(...args),
  getToolsByUsers: (...args: any[]) => mockGetToolsByUsers(...args),
  getUsersByDepartment: (...args: any[]) => mockGetUsersByDepartment(...args),
  getTools: (...args: any[]) => mockGetTools(...args),
}));

vi.mock("../../../components/Charts/VWCharts", () => ({
  VWBarChart: ({ data }: any) => <div data-testid="bar-chart">{data.length}</div>,
  VWDonutChart: ({ data }: any) => <div data-testid="donut-chart">{data.length}</div>,
}));

vi.mock("../../../components/Layout/PageHeaderExtended", () => ({
  PageHeaderExtended: ({ children, title }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      {children}
    </div>
  ),
}));

vi.mock("../../../components/Modals/ShadowAIOnboarding", () => ({
  default: () => <div data-testid="shadow-ai-onboarding" />,
}));

import InsightsPage from "../InsightsPage";

const summary: ShadowAiInsightsSummary = {
  unique_apps: 12,
  total_ai_users: 48,
  highest_risk_tool: { name: "ChatGPT", risk_score: 82 },
  most_active_department: "Engineering",
  departments_using_ai: 5,
};

const toolsByEvents: ShadowAiToolByEvents[] = [
  { tool_name: "ChatGPT", event_count: 500 },
  { tool_name: "Claude", event_count: 300 },
];

const toolsByUsers: ShadowAiToolByUsers[] = [{ tool_name: "ChatGPT", user_count: 20 }];

const departments: ShadowAiUsersByDepartment[] = [
  { department: "Engineering", user_count: 15 },
  { department: "Finance", user_count: 5 },
];

const topRiskTools: IShadowAiTool[] = [
  {
    id: 1,
    name: "ChatGPT",
    domains: ["chat.openai.com"],
    status: "detected",
    risk_score: 82,
    total_users: 20,
    total_events: 500,
  },
];

describe("ShadowAI - InsightsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetInsightsSummary.mockResolvedValue(summary);
    mockGetToolsByEvents.mockResolvedValue(toolsByEvents);
    mockGetToolsByUsers.mockResolvedValue(toolsByUsers);
    mockGetUsersByDepartment.mockResolvedValue(departments);
    mockGetTools.mockResolvedValue({ tools: topRiskTools, total: 1, page: 1, limit: 5 });
  });

  it("renders without crashing", () => {
    renderWithProviders(<InsightsPage />, { route: "/shadow-ai/insights" });
    expect(screen.getByTestId("page-header")).toBeInTheDocument();
  });

  it("shows loading placeholders before data resolves", () => {
    mockGetInsightsSummary.mockImplementation(() => new Promise(() => {}));
    renderWithProviders(<InsightsPage />);
    expect(screen.getAllByText("...").length).toBeGreaterThan(0);
  });

  it("renders summary stat cards once data loads", async () => {
    renderWithProviders(<InsightsPage />);

    await waitFor(() => {
      expect(screen.getByText("12")).toBeInTheDocument();
    });
    expect(screen.getByText("48")).toBeInTheDocument();
    expect(screen.getAllByText("ChatGPT").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Engineering").length).toBeGreaterThan(0);
  });

  it("renders the top risk tools list with events formatted", async () => {
    renderWithProviders(<InsightsPage />);

    await waitFor(() => {
      expect(screen.getByText("500 events")).toBeInTheDocument();
    });
  });

  it("renders department breakdown chart with data", async () => {
    renderWithProviders(<InsightsPage />);

    await waitFor(() => {
      expect(screen.getByTestId("donut-chart")).toHaveTextContent("2");
    });
    expect(screen.getByText("Finance")).toBeInTheDocument();
  });

  it("renders bar charts for tools by events and by users", async () => {
    renderWithProviders(<InsightsPage />);

    await waitFor(() => {
      expect(screen.getAllByTestId("bar-chart").length).toBe(2);
    });
  });

  it("shows empty state placeholders when no data is available", async () => {
    mockGetToolsByEvents.mockResolvedValue([]);
    mockGetToolsByUsers.mockResolvedValue([]);
    mockGetUsersByDepartment.mockResolvedValue([]);
    mockGetTools.mockResolvedValue({ tools: [], total: 0, page: 1, limit: 5 });

    renderWithProviders(<InsightsPage />);

    await waitFor(() => {
      expect(screen.getAllByText("No data available for this period").length).toBeGreaterThan(0);
    });
  });

  it("navigates to the tools page when the unique apps card is clicked", async () => {
    renderWithProviders(<InsightsPage />);

    await waitFor(() => {
      expect(screen.getByText("Unique apps")).toBeInTheDocument();
    });
    // StatCard's onClick is attached to the outer Card; clicking the title
    // element still bubbles up to trigger navigation.
    fireEvent.click(screen.getByText("Unique apps"));
    expect(mockNavigate).toHaveBeenCalledWith("/shadow-ai/tools");
  });

  it("reloads data when the period selector changes", async () => {
    renderWithProviders(<InsightsPage />);

    await waitFor(() => {
      expect(mockGetInsightsSummary).toHaveBeenCalledWith("30d");
    });

    fireEvent.mouseDown(screen.getByRole("combobox"));
    fireEvent.click(screen.getByRole("option", { name: "Last 7 days" }));

    await waitFor(() => {
      expect(mockGetInsightsSummary).toHaveBeenCalledWith("7d");
    });
  });

  it("logs and recovers when the API calls fail", async () => {
    mockGetInsightsSummary.mockRejectedValue(new Error("network error"));
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderWithProviders(<InsightsPage />);

    await waitFor(() => {
      expect(screen.getByText("Unique apps")).toBeInTheDocument();
    });
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
