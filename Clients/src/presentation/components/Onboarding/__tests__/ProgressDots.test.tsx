import { renderWithProviders } from "../../../../test/renderWithProviders";
import ProgressDots from "../ProgressDots";

describe("ProgressDots", () => {
  it("renders correct number of dots", () => {
    const { container } = renderWithProviders(<ProgressDots totalSteps={5} currentStep={0} />);
    const dots = container.firstChild?.childNodes;
    expect(dots?.length).toBe(5);
  });

  it("renders a single dot when totalSteps is 1", () => {
    const { container } = renderWithProviders(<ProgressDots totalSteps={1} currentStep={0} />);
    const dots = container.firstChild?.childNodes;
    expect(dots?.length).toBe(1);
  });

  it("marks current step as active", () => {
    const { container } = renderWithProviders(<ProgressDots totalSteps={3} currentStep={1} />);
    const dots = container.firstChild?.childNodes;
    expect(dots?.length).toBe(3);
  });
});
