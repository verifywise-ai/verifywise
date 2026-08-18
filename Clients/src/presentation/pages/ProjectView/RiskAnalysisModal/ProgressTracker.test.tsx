import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import ProgressTracker from "./ProgressTracker";

describe("ProgressTracker", () => {
  it("renders the current step and total steps", () => {
    renderWithProviders(<ProgressTracker currentStep={2} totalSteps={5} />);
    expect(screen.getByText("Question 2 of 5")).toBeInTheDocument();
  });

  it("computes and rounds the completion percentage", () => {
    renderWithProviders(<ProgressTracker currentStep={1} totalSteps={3} />);
    expect(screen.getByText("33%")).toBeInTheDocument();
  });

  it("shows 100% when current step equals total steps", () => {
    renderWithProviders(<ProgressTracker currentStep={5} totalSteps={5} />);
    expect(screen.getByText("100%")).toBeInTheDocument();
  });

  it("shows 0% when totalSteps is 0", () => {
    renderWithProviders(<ProgressTracker currentStep={0} totalSteps={0} />);
    expect(screen.getByText("0%")).toBeInTheDocument();
  });
});
