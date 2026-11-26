import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import DimensionBars, { dimensionBarColor } from "../assessment/DimensionBars";
import { riskMark } from "../../../themes/palette";

describe("DimensionBars", () => {
  it("renders one bar per dimension with its score and the band legend", () => {
    renderWithProviders(
      <DimensionBars
        dimensions={[
          { key: "data_sensitivity", label: "Data sensitivity", score: 85 },
          { key: "autonomy", name: "Autonomy", score: 20 },
          { key: "unlabelled", score: 50 },
          { score: 60 },
        ]}
      />,
    );
    expect(screen.getAllByRole("progressbar")).toHaveLength(4);
    expect(screen.getByText("Data sensitivity")).toBeInTheDocument();
    expect(screen.getByText("85/100")).toBeInTheDocument();
    expect(screen.getByText("Autonomy")).toBeInTheDocument();
    expect(screen.getByText("unlabelled")).toBeInTheDocument();
    expect(screen.getByText("Dimension 4")).toBeInTheDocument();
    expect(screen.getByText("Low (0-25)")).toBeInTheDocument();
    expect(screen.getByText("Critical (76-100)")).toBeInTheDocument();
  });

  it("renders nothing without dimensions", () => {
    renderWithProviders(<DimensionBars dimensions={[]} />);
    expect(screen.queryByTestId("intake-dimension-bars")).toBeNull();
  });

  it("colours a score by its band", () => {
    expect(dimensionBarColor(25)).toBe(riskMark.low);
    expect(dimensionBarColor(26)).toBe(riskMark.medium);
    expect(dimensionBarColor(75)).toBe(riskMark.high);
    expect(dimensionBarColor(76)).toBe(riskMark.critical);
  });
});
