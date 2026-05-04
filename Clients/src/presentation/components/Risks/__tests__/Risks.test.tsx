import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import Risks from "../index";

describe("Risks", () => {
  const defaultProps = {
    veryHighRisks: 3,
    highRisks: 5,
    mediumRisks: 8,
    lowRisks: 12,
    veryLowRisks: 2,
  };

  it("renders all risk categories", () => {
    renderWithProviders(<Risks {...defaultProps} />);
    expect(screen.getByText("Very high risks")).toBeInTheDocument();
    expect(screen.getByText("High risks")).toBeInTheDocument();
    expect(screen.getByText("Medium risks")).toBeInTheDocument();
    expect(screen.getByText("Low risks")).toBeInTheDocument();
    expect(screen.getByText("Very low risks")).toBeInTheDocument();
  });

  it("renders risk counts", () => {
    renderWithProviders(<Risks {...defaultProps} />);
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
  });

  it("renders with zero values", () => {
    renderWithProviders(
      <Risks veryHighRisks={0} highRisks={0} mediumRisks={0} lowRisks={0} veryLowRisks={0} />,
    );
    const zeros = screen.getAllByText("0");
    expect(zeros).toHaveLength(5);
  });
});
