import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import MetricSection from "../index";
import { Assessments, Controls } from "../../../../domain/types/projectStatus.types";

describe("MetricSection", () => {
  const mockAssessments: Assessments = {
    percentageComplete: 75.5,
    allDoneAssessments: 30,
    allTotalAssessments: 40,
  };

  const mockControls: Controls = {
    percentageComplete: 60.25,
    allDoneSubControls: 24,
    allTotalSubControls: 40,
  };

  const defaultProps = {
    title: "Compliance Metrics",
    assessments: mockAssessments,
    controls: mockControls,
  };

  it("renders the section title", () => {
    renderWithProviders(<MetricSection {...defaultProps} />);

    expect(screen.getByText("Compliance Metrics")).toBeInTheDocument();
  });

  it("renders the requirements tracker completion rate", () => {
    renderWithProviders(<MetricSection {...defaultProps} />);

    expect(screen.getByText("Requirements tracker completion rate")).toBeInTheDocument();
    expect(screen.getByText("60.25%")).toBeInTheDocument();
  });

  it("renders the controls tracker completion rate", () => {
    renderWithProviders(<MetricSection {...defaultProps} />);

    expect(screen.getByText("Controls tracker completion rate")).toBeInTheDocument();
    expect(screen.getByText("75.50%")).toBeInTheDocument();
  });
});
