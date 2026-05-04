import { vi } from "vitest";

vi.mock("../../StepperModal", () => ({
  default: ({ isOpen, children, title }: any) =>
    isOpen ? (
      <div data-testid="stepper-modal">
        <h2>{title}</h2>
        {children}
      </div>
    ) : null,
}));
vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

import { renderWithProviders } from "../../../../../test/renderWithProviders";
import AiOrNotScreening from "../index";

describe("AiOrNotScreening", () => {
  it("renders without crashing when open", () => {
    renderWithProviders(
      <AiOrNotScreening isOpen={true} onClose={vi.fn()} onSkip={vi.fn()} onComplete={vi.fn()} />,
    );
    expect(document.body).toBeTruthy();
  });
});
