import { vi } from "vitest";

vi.mock("../../../button/customizable-button", () => ({
  CustomizableButton: ({ children, onClick }: any) => <button onClick={onClick}>{children}</button>,
}));

import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../../test/renderWithProviders";
import StepperModal from "../index";

describe("StepperModal", () => {
  it("renders when open with steps", () => {
    renderWithProviders(
      <StepperModal
        isOpen={true}
        onClose={vi.fn()}
        title="Wizard"
        steps={["Step 1", "Step 2", "Step 3"]}
        activeStep={0}
      >
        <div>Step content</div>
      </StepperModal>,
    );
    expect(screen.getByText("Wizard")).toBeInTheDocument();
  });
});
