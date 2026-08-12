import { screen } from "@testing-library/react";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import RiskHeatMap from "../RiskHeatMap";
import type { RiskModel } from "../../../../domain/models/Common/risks/risk.model";

/**
 * `severity` + `likelihood` describe the current risk (they feed
 * `risk_level_autocalculated`, which the summary cards and the risks table show).
 * `risk_severity` + `likelihood_mitigation` describe the residual risk after
 * mitigation. The heat map plots the current risk, so it must not read either
 * mitigation field.
 *
 * Cell scores come from RiskCalculator (likelihood + 3 × severity), so the map
 * reports the same risk level as the rest of the app.
 */
const asRisks = (risks: Record<string, unknown>[]) => risks as unknown as RiskModel[];

describe("RiskHeatMap", () => {
  it("plots a risk by its current severity, not the post-mitigation severity", () => {
    renderWithProviders(
      <RiskHeatMap
        risks={asRisks([
          {
            id: 1,
            risk_name: "Algorithmic bias",
            likelihood: "Possible", // 3
            severity: "Major", // 4 → 3 + 12 = 15
            likelihood_mitigation: "Possible",
            risk_severity: "Moderate", // 3 → would wrongly give 3 + 9 = 12
          },
        ])}
      />,
    );

    expect(screen.getByText("L15")).toBeInTheDocument();
    expect(screen.queryByText("L12")).not.toBeInTheDocument();
  });

  it("scores cells with the same weighted formula as the rest of the app", () => {
    renderWithProviders(
      <RiskHeatMap
        risks={asRisks([
          {
            id: 2,
            risk_name: "Unmitigated risk",
            likelihood: "Almost Certain", // 5
            severity: "Catastrophic", // 5 → 5 + 15 = 20
          },
        ])}
      />,
    );

    // The multiplicative score this map used to show would have been 25.
    expect(screen.getByText("L20")).toBeInTheDocument();
    expect(screen.queryByText("L25")).not.toBeInTheDocument();
  });

  it("labels the legend with the app's risk levels and their score ranges", () => {
    renderWithProviders(<RiskHeatMap risks={[]} />);

    expect(screen.getAllByText("High risk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Level 13-16").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Very high risk").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Level 17-20").length).toBeGreaterThan(0);
  });

  it("leaves every cell empty when there are no risks", () => {
    renderWithProviders(<RiskHeatMap risks={[]} />);

    expect(screen.queryByText(/^L\d+$/)).not.toBeInTheDocument();
  });
});
