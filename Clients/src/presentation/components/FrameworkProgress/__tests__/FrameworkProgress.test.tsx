import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FrameworkProgress } from "../index";

describe("FrameworkProgress", () => {
  const defaultProps = {
    name: "EU AI Act",
    progress: 65,
    completed: 13,
    total: 20,
  };

  it("renders the framework name", () => {
    renderWithProviders(<FrameworkProgress {...defaultProps} />);
    expect(screen.getByText("EU AI Act")).toBeInTheDocument();
  });

  it("shows the progress percentage", () => {
    renderWithProviders(<FrameworkProgress {...defaultProps} />);
    expect(screen.getByText("13/20 (65%)")).toBeInTheDocument();
  });

  it("shows completed/total counts", () => {
    renderWithProviders(
      <FrameworkProgress {...defaultProps} completed={8} total={10} progress={80} />,
    );
    expect(screen.getByText("8/10 (80%)")).toBeInTheDocument();
  });

  it("renders a linear progress bar", () => {
    renderWithProviders(<FrameworkProgress {...defaultProps} />);
    const progressBar = screen.getByRole("progressbar");
    expect(progressBar).toBeInTheDocument();
    expect(progressBar).toHaveAttribute("aria-valuenow", "65");
  });

  it("rounds progress percentage", () => {
    renderWithProviders(
      <FrameworkProgress name="ISO 42001" progress={33.7} completed={5} total={15} />,
    );
    expect(screen.getByText("5/15 (34%)")).toBeInTheDocument();
  });
});
