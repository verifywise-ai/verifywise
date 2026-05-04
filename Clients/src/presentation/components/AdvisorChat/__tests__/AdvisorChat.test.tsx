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

vi.mock("react-router", () => ({
  useNavigate: () => vi.fn(),
}));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import AdvisorChat from "../index";

describe("AdvisorChat", () => {
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
});
