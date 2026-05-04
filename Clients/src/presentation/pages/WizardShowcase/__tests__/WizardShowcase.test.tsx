import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";

// Mock the AIDetectionOnboarding modal
vi.mock("../../../components/Modals/AIDetectionOnboarding", () => ({
  default: ({ isOpen }: any) => (isOpen ? <div data-testid="ai-detection-onboarding" /> : null),
}));

// Mock the CustomizableButton
vi.mock("../../../components/button/customizable-button", () => ({
  CustomizableButton: ({ text, onClick }: any) => (
    <button data-testid="open-wizard-btn" onClick={onClick}>
      {text}
    </button>
  ),
}));

import WizardShowcase from "../index";

describe("WizardShowcase", () => {
  it("renders without crashing", () => {
    renderWithProviders(<WizardShowcase />);
    expect(screen.getByText("AI Detection onboarding wizard")).toBeInTheDocument();
  });

  it("displays the description text", () => {
    renderWithProviders(<WizardShowcase />);
    expect(
      screen.getByText("Preview the onboarding modal for the AI Detection module."),
    ).toBeInTheDocument();
  });

  it("renders the open wizard button", () => {
    renderWithProviders(<WizardShowcase />);
    expect(screen.getByText("Open onboarding wizard")).toBeInTheDocument();
  });
});
