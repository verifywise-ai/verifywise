import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../../../test/renderWithProviders";
import ModelRiskSummary from "./ModelRiskSummary";
import { ModelRiskCategory, ModelRiskLevel, ModelRiskStatus } from "../../../domain/interfaces/i.modelRisk";
import type { IModelRisk } from "../../../domain/interfaces/i.modelRisk";

const modelRisks: IModelRisk[] = [
  {
    id: 1,
    risk_name: "Bias in scoring",
    risk_category: ModelRiskCategory.BIAS,
    risk_level: ModelRiskLevel.HIGH,
    status: ModelRiskStatus.OPEN,
    owner: "1",
    target_date: "2026-09-01",
  },
  {
    id: 2,
    risk_name: "Drift",
    risk_category: ModelRiskCategory.PERFORMANCE,
    risk_level: ModelRiskLevel.LOW,
    status: ModelRiskStatus.OPEN,
    owner: "1",
    target_date: "2026-09-01",
  },
];

describe("ModelRiskSummary", () => {
  it("counts total risks and each risk level", () => {
    renderWithProviders(<ModelRiskSummary modelRisks={modelRisks} />);

    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("Low")).toBeInTheDocument();
    expect(screen.getByText("Medium")).toBeInTheDocument();
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("renders zero counts when there are no risks", () => {
    renderWithProviders(<ModelRiskSummary modelRisks={[]} />);
    expect(screen.getAllByText("0").length).toBe(5);
  });

  it("invokes onCardClick with the risk-level key", () => {
    const onCardClick = vi.fn();
    renderWithProviders(<ModelRiskSummary modelRisks={modelRisks} onCardClick={onCardClick} />);

    fireEvent.click(screen.getByText("High").closest("div")!);
    expect(onCardClick).toHaveBeenCalledWith(ModelRiskLevel.HIGH);
  });
});
