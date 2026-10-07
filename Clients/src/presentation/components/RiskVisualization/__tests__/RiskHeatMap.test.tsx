import { vi } from "vitest";
import userEvent from "@testing-library/user-event";
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

/**
 * Cell-select mode, used by the vendor risk heat map: a cell with risks in it
 * is a toggle button that hands the caller its coordinates.
 */
describe("RiskHeatMap cell selection", () => {
  const vendorRisks = [
    { id: 1, risk_name: "Data leak", likelihood: "Possible", severity: "Major" },
    { id: 2, risk_name: "Outage", likelihood: "Possible", severity: "Major" },
  ];

  it("makes only populated cells buttons, labelled with their position and count", () => {
    renderWithProviders(<RiskHeatMap risks={vendorRisks} onCellSelect={vi.fn()} />);

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0]).toHaveAccessibleName("Medium likelihood, High severity: 2 risks");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "false");
  });

  it("hands back the cell's coordinates on click, Enter and Space", async () => {
    const onCellSelect = vi.fn();
    renderWithProviders(<RiskHeatMap risks={vendorRisks} onCellSelect={onCellSelect} />);
    const cell = screen.getByRole("button");

    await userEvent.click(cell);
    cell.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");

    expect(onCellSelect).toHaveBeenCalledTimes(3);
    for (const [arg] of onCellSelect.mock.calls) {
      expect(arg).toEqual({ likelihood: 3, severity: 4 });
    }
  });

  it("marks the selected cell pressed", () => {
    renderWithProviders(
      <RiskHeatMap
        risks={vendorRisks}
        onCellSelect={vi.fn()}
        selectedCell={{ likelihood: 3, severity: 4 }}
      />,
    );

    expect(screen.getByRole("button")).toHaveAttribute("aria-pressed", "true");
  });

  it("keeps the project risks view pointer-only", () => {
    renderWithProviders(<RiskHeatMap risks={asRisks(vendorRisks)} onRiskSelect={vi.fn()} />);

    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
