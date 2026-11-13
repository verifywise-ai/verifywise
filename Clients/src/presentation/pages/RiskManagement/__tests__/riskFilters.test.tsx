import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "../../../../test/renderWithProviders";
import { FilterChips } from "../../../components/Table/FilterChips";
import type { FilterColumn } from "../../../components/Table/FilterBy";
import type { RiskModel } from "../../../../domain/models/Common/risks/risk.model";
import {
  getRiskFieldValue,
  riskLevelCardKey,
  RISK_LEVEL_OPTIONS,
  SEVERITY_OPTIONS,
} from "../riskFilters";

const columns: FilterColumn[] = [
  { id: "severity", label: "Severity", type: "select", options: SEVERITY_OPTIONS },
  { id: "risk_level", label: "Risk level", type: "select", options: RISK_LEVEL_OPTIONS },
];

// Shaped like the API rows: severity from the Severity enum, the level from
// current_risk_level (note its "Very Low risk" casing) or the calculated level.
const risks = [
  { severity: "Catastrophic", current_risk_level: "Very high risk" },
  { severity: "Major", current_risk_level: "High risk" },
  { severity: "Major", current_risk_level: null, risk_level_autocalculated: "Medium risk" },
  { severity: "Negligible", current_risk_level: "Very Low risk" },
] as unknown as RiskModel[];

const optionTexts = () =>
  within(screen.getByRole("menu"))
    .getAllByRole("menuitem")
    .map((item) => item.textContent);

describe("Risk management filter chips", () => {
  it("severity and risk level chips list the values the risks hold, with counts", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <FilterChips<RiskModel>
        columns={columns}
        onFilterChange={vi.fn()}
        data={risks}
        getFieldValue={getRiskFieldValue}
      />,
    );

    await user.click(screen.getByTestId("filter-chip-severity"));
    expect(optionTexts()).toEqual(["All", "Negligible1", "Major2", "Catastrophic1"]);
    await user.keyboard("{Escape}");

    await user.click(screen.getByTestId("filter-chip-risk_level"));
    expect(optionTexts()).toEqual([
      "All",
      "Very high risk1",
      "High risk1",
      "Medium risk1",
      "Very low risk1",
    ]);
  });

  it("maps a filtered risk level to its summary card", () => {
    expect(riskLevelCardKey("Very high risk")).toBe("Very high");
    expect(riskLevelCardKey("Very Low risk")).toBe("Very low");
    expect(riskLevelCardKey("No risk")).toBe("Very low");
    expect(riskLevelCardKey("unknown")).toBeNull();
  });
});
