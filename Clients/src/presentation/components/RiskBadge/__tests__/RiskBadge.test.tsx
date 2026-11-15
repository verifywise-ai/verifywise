import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RiskBadge from "../index";
import { riskMark, status } from "../../../themes/palette";

describe("RiskBadge", () => {
  it("renders the score text", () => {
    renderWithProviders(<RiskBadge score={55} />);
    expect(screen.getByText("55")).toBeInTheDocument();
  });

  it("applies red color for high scores (>= 70)", () => {
    renderWithProviders(<RiskBadge score={85} />);
    const scoreText = screen.getByText("85");
    expect(scoreText).toHaveStyle({ color: riskMark.critical });
  });

  it("applies amber color for medium scores (40-69)", () => {
    renderWithProviders(<RiskBadge score={50} />);
    const scoreText = screen.getByText("50");
    expect(scoreText).toHaveStyle({ color: riskMark.medium });
  });

  it("applies green color for low scores (< 40)", () => {
    renderWithProviders(<RiskBadge score={20} />);
    const scoreText = screen.getByText("20");
    expect(scoreText).toHaveStyle({ color: status.success.strong });
  });

  it("applies red at the boundary score of 70", () => {
    renderWithProviders(<RiskBadge score={70} />);
    const scoreText = screen.getByText("70");
    expect(scoreText).toHaveStyle({ color: riskMark.critical });
  });

  it("applies amber at the boundary score of 40", () => {
    renderWithProviders(<RiskBadge score={40} />);
    const scoreText = screen.getByText("40");
    expect(scoreText).toHaveStyle({ color: riskMark.medium });
  });
});
