import { screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("@assistant-ui/react", () => ({
  ThreadPrimitive: {
    Root: ({ children }: any) => <div>{children}</div>,
    Viewport: ({ children }: any) => <div>{children}</div>,
    Messages: () => null,
    Suggestion: ({ children }: any) => <div>{children}</div>,
  },
}));

vi.mock("../CustomMessage", () => ({ CustomMessage: () => null }));
vi.mock("../CustomComposer", () => ({
  CustomComposer: () => <div data-testid="custom-composer" />,
}));
vi.mock("../advisorConfig", () => ({ getSuggestions: () => [] }));
vi.mock("../../../../application/hooks/useAuth", () => ({
  useAuth: () => ({ userRoleName: "Admin" }),
}));
vi.mock("react-router", () => ({ useNavigate: () => vi.fn() }));

import { renderWithProviders } from "../../../../test/renderWithProviders";
import { CustomThread } from "../CustomThread";

describe("CustomThread", () => {
  it("renders the composer when hasLLMKeys is true or undefined", () => {
    renderWithProviders(<CustomThread hasLLMKeys={true} />);
    expect(screen.getByTestId("custom-composer")).toBeInTheDocument();
  });

  it("renders a locked message instead of the composer when hasLLMKeys is false", () => {
    renderWithProviders(<CustomThread hasLLMKeys={false} />);
    expect(screen.queryByTestId("custom-composer")).not.toBeInTheDocument();
    expect(
      screen.getByText(/configure an llm api key to send messages/i),
    ).toBeInTheDocument();
  });

  it("does not lock the composer while LLM key status is still loading", () => {
    renderWithProviders(<CustomThread hasLLMKeys={false} isLoadingLLMKeys={true} />);
    expect(screen.getByTestId("custom-composer")).toBeInTheDocument();
  });
});
