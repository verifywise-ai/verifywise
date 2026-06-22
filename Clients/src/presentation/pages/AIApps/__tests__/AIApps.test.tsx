import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { AiAppStatus } from "../../../../domain/enums/aiApp.enum";

// Mock the AI Apps repository/hooks dependencies
vi.mock("../../../../application/hooks/useAiApps", () => ({
  useAiApps: vi.fn().mockReturnValue({
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
  }),
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
  });

  it("renders the AI Apps catalog", () => {
    renderWithProviders(<AIApps />, { route: "/ai-apps" });

    expect(screen.getByTestId("page-header")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT")).toBeInTheDocument();
    expect(screen.getByText("Approved")).toBeInTheDocument();
  });
});
