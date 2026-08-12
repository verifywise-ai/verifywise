import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import RelatedRisksSummary from "../index";
import { RiskModel } from "../../../../domain/models/Common/risks/risk.model";
import { RelatedRisk } from "../../../../application/tools/relatedRisks";
import { RiskLevelAutoCalculated } from "../../../../domain/enums/riskLevelAutoCalculated.enum";

const risk = (id: number, name: string): RiskModel =>
  ({
    id,
    risk_name: name,
    risk_level_autocalculated: RiskLevelAutoCalculated.HighRisk,
  }) as RiskModel;

const related: RelatedRisk[] = [
  {
    risk: risk(2, "Training data drift"),
    score: 5,
    reasons: ["Shared category: Data Quality", "Shared control: AC-1"],
    recommendation: "Re-run the validation pipeline",
  },
  {
    risk: risk(3, "Vendor model opacity"),
    score: 3,
    reasons: ["Shared category: Data Quality"],
    recommendation: "Same category (Data Quality) — re-check this risk's likelihood and severity for consistency.",
  },
];

describe("RelatedRisksSummary", () => {
  it("names the saved risk and lists every related risk with its reasons and recommendation", () => {
    render(
      <RelatedRisksSummary
        subject={risk(1, "Biased hiring model")}
        related={related}
        onClose={vi.fn()}
        onOpenRisk={vi.fn()}
      />,
    );

    expect(screen.getByText(/Biased hiring model/)).toBeInTheDocument();
    expect(screen.getByText("Training data drift")).toBeInTheDocument();
    expect(screen.getByText("Vendor model opacity")).toBeInTheDocument();
    expect(screen.getByText("Shared control: AC-1")).toBeInTheDocument();
    expect(screen.getByText("Re-run the validation pipeline")).toBeInTheDocument();
  });

  it("passes the clicked risk to onOpenRisk", async () => {
    const onOpenRisk = vi.fn();
    render(
      <RelatedRisksSummary
        subject={risk(1, "Biased hiring model")}
        related={related}
        onClose={vi.fn()}
        onOpenRisk={onOpenRisk}
      />,
    );

    await userEvent.click(screen.getAllByRole("button", { name: "Open" })[0]);

    expect(onOpenRisk).toHaveBeenCalledTimes(1);
    expect(onOpenRisk.mock.calls[0][0].id).toBe(2);
  });
});
