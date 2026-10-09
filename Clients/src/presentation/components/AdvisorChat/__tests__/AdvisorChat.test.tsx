import { screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@assistant-ui/react", () => ({
  AssistantRuntimeProvider: ({ children }: any) => (
    <div data-testid="assistant-runtime">{children}</div>
  ),
}));

vi.mock("../useAdvisorRuntime", () => ({
  useAdvisorRuntime: vi.fn().mockReturnValue({}),
}));

vi.mock("../CustomThread", () => ({
  CustomThread: () => <div data-testid="custom-thread" />,
}));

vi.mock("../AdvisorHeader", () => ({
  AdvisorHeader: () => <div data-testid="advisor-header" />,
}));

vi.mock("../advisorConfig", () => ({
  AdvisorDomain: {},
}));

vi.mock("../../../../application/contexts/AdvisorConversation.context", () => ({
  useAdvisorConversationSafe: vi.fn().mockReturnValue(null),
}));

vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userId: 1 }),
}));

let mockParallelAgents = false;
vi.mock("../../../../application/hooks/useUserPreferences", () => ({
  default: () => ({
    userPreferences: { parallel_agents: mockParallelAgents },
    loading: false,
    isDefault: false,
    refreshUserPreferences: vi.fn(),
  }),
}));

vi.mock("react-router", () => ({
  MemoryRouter: ({ children }: any) => <>{children}</>,
  useNavigate: () => vi.fn(),
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import AdvisorChat from "../index";
import { useAdvisorRuntime } from "../useAdvisorRuntime";

describe("AdvisorChat", () => {
  beforeEach(() => {
    mockParallelAgents = false;
    vi.mocked(useAdvisorRuntime).mockClear();
  });

  it("renders without crashing", () => {
    renderWithProviders(<AdvisorChat />);
    expect(document.body).toBeTruthy();
  });

  it("renders with pageContext prop", () => {
    renderWithProviders(<AdvisorChat pageContext={"general" as any} />);
    expect(document.body).toBeTruthy();
  });

  it("renders loading state when LLM keys are loading", () => {
    renderWithProviders(<AdvisorChat isLoadingLLMKeys={true} />);
    expect(document.body).toBeTruthy();
  });

  it("still renders the header and thread when no LLM key is configured", () => {
    renderWithProviders(<AdvisorChat hasLLMKeys={false} isLoadingLLMKeys={false} />);
    expect(screen.queryByTestId("advisor-header")).toBeInTheDocument();
    expect(screen.queryByTestId("custom-thread")).toBeInTheDocument();
    expect(screen.queryByRole("switch", { name: "Parallel agents" })).not.toBeInTheDocument();
  });

  it("sends the saved parallel-agents preference to the advisor runtime", () => {
    mockParallelAgents = true;
    renderWithProviders(<AdvisorChat />);
    expect(vi.mocked(useAdvisorRuntime)).toHaveBeenCalledWith(undefined, undefined, true);
  });
});
