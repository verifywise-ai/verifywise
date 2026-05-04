import { vi } from "vitest";

vi.mock("../../../../../application/hooks/useProjects", () => ({
  useProjects: () => ({ data: [] }),
}));
vi.mock("../../../../../application/hooks/useUsers", () => ({
  default: () => ({ users: [] }),
}));
vi.mock("../../../../../application/hooks/useIsAdmin", () => ({
  useIsAdmin: () => true,
}));
vi.mock("../../../../../application/hooks/useLLMKeyStatus", () => ({
  useLLMKeyStatus: () => ({ data: { hasKeys: true, isLoading: false } }),
}));
vi.mock("../../../Alert", () => ({
  default: () => null,
}));
vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children }: any) => <button>{children}</button>,
}));
vi.mock("../AIKeyBanner", () => ({
  default: () => null,
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
  it("renders without crashing", () => {
    renderWithProviders(<GenerateReport onClose={vi.fn()} reportType="project" />);
    expect(document.body).toBeTruthy();
  });
});
