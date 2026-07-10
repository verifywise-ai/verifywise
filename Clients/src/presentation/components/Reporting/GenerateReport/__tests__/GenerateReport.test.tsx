import { vi } from "vitest";
import { screen } from "@testing-library/react";

vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [] }),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));
vi.mock("../../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => true,
}));

const mockLLMKeyStatus = vi.hoisted(() => ({
  data: { hasKeys: true, keyCount: 1, providers: ["Anthropic"] } as any,
  loading: false,
  error: null as string | null,
}));

vi.mock("../../../../../application/hooks/useLLMKeyStatus", () => ({
  useLLMKeyStatus: () => mockLLMKeyStatus,
}));
vi.mock("../../../Alert", () => ({
  default: () => null,
}));
vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children }: any) => <button>{children}</button>,
}));
vi.mock("../AIKeyBanner", () => ({
  default: () => <div data-testid="ai-key-banner" />,
}));
vi.mock("../../../../../application/tools/alertUtils", () => ({
  handleAlert: vi.fn(),
}));
vi.mock("../../../Modals/StandardModal", () => ({
  default: ({ isOpen, children }: any) =>
    isOpen ? <div data-testid="standard-modal">{children}</div> : null,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import GenerateReport from "../index";

describe("GenerateReport", () => {
  beforeEach(() => {
    mockLLMKeyStatus.data = { hasKeys: true, keyCount: 1, providers: ["Anthropic"] };
    mockLLMKeyStatus.loading = false;
  });

  it("renders without crashing", () => {
    renderWithProviders(<GenerateReport onClose={vi.fn()} reportType="project" />);
    expect(document.body).toBeTruthy();
  });

  it("does not show the AI key banner while LLM key status is still loading", () => {
    mockLLMKeyStatus.data = null;
    mockLLMKeyStatus.loading = true;
    renderWithProviders(<GenerateReport onClose={vi.fn()} reportType="project" />);
    expect(screen.queryByTestId("ai-key-banner")).not.toBeInTheDocument();
  });

  it("shows the AI key banner when no key is configured and status is not loading", () => {
    mockLLMKeyStatus.data = { hasKeys: false, keyCount: 0, providers: [] };
    mockLLMKeyStatus.loading = false;
    renderWithProviders(<GenerateReport onClose={vi.fn()} reportType="project" />);
    expect(screen.getByTestId("ai-key-banner")).toBeInTheDocument();
  });
});
