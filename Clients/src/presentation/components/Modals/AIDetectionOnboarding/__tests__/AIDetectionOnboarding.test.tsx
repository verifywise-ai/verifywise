import { vi } from "vitest";

vi.mock("../../OnboardingWizard", () => ({
  default: ({ isOpen, title }: any) => (isOpen ? <div data-testid="wizard">{title}</div> : null),
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AIDetectionOnboarding from "../index";

describe("AIDetectionOnboarding", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(<AIDetectionOnboarding isOpen={true} onClose={vi.fn()} />);
    expect(document.body).toBeTruthy();
  });
});
