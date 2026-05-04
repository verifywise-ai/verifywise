import { vi } from "vitest";

vi.mock("../../../../application/hooks/useTipManager", () => ({
  useTipManager: vi.fn().mockReturnValue({
    currentTip: { header: "Pro Tip", content: "This is a helpful tip." },
    dismissTip: vi.fn(),
    currentTipNumber: 1,
    totalTips: 3,
  }),
}));

vi.mock("../../InfoBox", () => ({
  default: (props: Record<string, unknown>) => (
    <div data-testid="info-box">
      <span data-testid="info-header">{String(props.header)}</span>
      <span data-testid="info-message">{String(props.message)}</span>
    </div>
  ),
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import TipBox from "../index";
import { useTipManager } from "../../../../application/hooks/useTipManager";

describe("TipBox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useTipManager).mockReturnValue({
      currentTip: { header: "Pro Tip", content: "This is a helpful tip." },
      dismissTip: vi.fn(),
      hasTips: true,
      currentTipNumber: 1,
      totalTips: 3,
    });
  });

  it("renders tip content when a tip is available", () => {
    renderWithProviders(<TipBox entityName="risks" />);
    expect(screen.getByTestId("info-box")).toBeInTheDocument();
    expect(screen.getByTestId("info-header")).toHaveTextContent("Pro Tip");
    expect(screen.getByTestId("info-message")).toHaveTextContent("This is a helpful tip.");
  });

  it("displays tip counter", () => {
    renderWithProviders(<TipBox entityName="risks" />);
    expect(screen.getByText("Tip 1 of 3")).toBeInTheDocument();
  });

  it("renders nothing when no tip is available", () => {
    vi.mocked(useTipManager).mockReturnValueOnce({
      currentTip: null,
      dismissTip: vi.fn(),
      hasTips: false,
      currentTipNumber: 0,
      totalTips: 0,
    });
    const { container } = renderWithProviders(<TipBox entityName="risks" />);
    expect(container.firstChild).toBeNull();
  });
});
