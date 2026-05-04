import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { StepProgressDialog, ProgressStep } from "../index";

const steps: ProgressStep[] = [
  { label: "Validating input", progress: 25 },
  { label: "Processing data", progress: 50 },
  { label: "Generating report", progress: 75 },
  { label: "Finalizing", progress: 100 },
];

describe("StepProgressDialog", () => {
  it("renders the dialog title and first step when open", () => {
    renderWithProviders(
      <StepProgressDialog open={true} title="Import Progress" steps={steps} currentStep={0} />,
    );

    expect(screen.getByText("Import Progress")).toBeInTheDocument();
    expect(screen.getByText("Validating input")).toBeInTheDocument();
  });

  it("displays step counter and progress percentage", () => {
    renderWithProviders(
      <StepProgressDialog open={true} title="Import Progress" steps={steps} currentStep={0} />,
    );

    expect(screen.getByText("Step 1 of 4")).toBeInTheDocument();
    expect(screen.getByText("25%")).toBeInTheDocument();
  });

  it("renders the correct step when currentStep is provided", () => {
    renderWithProviders(
      <StepProgressDialog open={true} title="Import Progress" steps={steps} currentStep={2} />,
    );

    expect(screen.getByText("Generating report")).toBeInTheDocument();
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("renders the progress bar", () => {
    renderWithProviders(
      <StepProgressDialog open={true} title="Import Progress" steps={steps} currentStep={1} />,
    );

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("does not render dialog content when open is false", () => {
    renderWithProviders(
      <StepProgressDialog open={false} title="Import Progress" steps={steps} currentStep={0} />,
    );

    expect(screen.queryByText("Import Progress")).not.toBeInTheDocument();
  });
});
